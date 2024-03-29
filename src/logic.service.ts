// SPDX-License-Identifier: Apache-2.0
/* eslint-disable @typescript-eslint/no-explicit-any */
import apm from './apm';
import { databaseManager, server, loggerService } from '.';
import { type RuleResult, type NetworkMap } from '@frmscoe/frms-coe-lib/lib/interfaces';
import { type TypologyResult } from '@frmscoe/frms-coe-lib/lib/interfaces/processor-files/TypologyResult';
import { type CADPRequest } from '@frmscoe/frms-coe-lib/lib/interfaces/processor-files/CADPRequest';
import { configuration } from './config';
import { type ITypologyExpression } from './interfaces/iTypologyExpression';
import { CalculateDuration } from '@frmscoe/frms-coe-lib/lib/helpers/calculatePrcg';
import { type MetaData } from '@frmscoe/frms-coe-lib/lib/interfaces/metaData';
import { evaluateTypologyExpression } from './utils/evaluateTExpression';

const saveToRedisGetAll = async (transactionId: string, ruleResult: RuleResult): Promise<RuleResult[] | undefined> => {
  const currentlyStoredRuleResult = await databaseManager.addOneGetAll(transactionId, { ruleResult: { ...ruleResult } });
  const ruleResults: RuleResult[] | undefined = currentlyStoredRuleResult.map((res) => res.ruleResult as RuleResult);
  return ruleResults;
};

const ruleResultAggregation = (
  networkMap: NetworkMap,
  ruleList: RuleResult[],
  ruleResult: RuleResult,
): { typologyResult: TypologyResult[]; ruleCount: number } => {
  const typologyResult: TypologyResult[] = [];
  const set = new Set();
  networkMap.messages.forEach((message) => {
    message.channels.forEach((channel) => {
      channel.typologies.forEach((typology) => {
        for (const rule of typology.rules) {
          set.add(rule.id);
        }
        if (!typology.rules.some((trule) => trule.id === ruleResult.id && trule.cfg === ruleResult.cfg)) return;
        const ruleResults = ruleList.filter((rRule) => typology.rules.some((tRule) => rRule.id === tRule.id));
        if (ruleResults.length) {
          typologyResult.push({
            id: typology.id,
            cfg: typology.cfg,
            result: -1,
            ruleResults,
            workflow: { alertThreshold: -1 },
          });
        }
      });
    });
  });

  return { typologyResult, ruleCount: set.size };
};

const evaluateTypologySendRequest = async (
  typologyResults: TypologyResult[],
  networkMap: NetworkMap,
  transaction: any,
  metaData: MetaData,
  transactionId: string,
  numberOfRules: {
    totalRules: number;
    storedRules: number;
  },
  msgId: string,
): Promise<CADPRequest | undefined> => {
  const logContext = 'evaluateTypologySendRequest()';
  let cadpReqBody: CADPRequest = { networkMap, transaction, typologyResult: typologyResults[0] };
  for (let index = 0; index < typologyResults.length; index++) {
    // Typology Wait for enough rules if they are not matching the number configured
    const networkMapRules = networkMap.messages[0].channels[0].typologies.find(
      (typology) => typology.cfg === typologyResults[index].cfg && typology.id === typologyResults[index].id,
    );
    const typologyResultRules = typologyResults[index].ruleResults;
    if (networkMapRules && typologyResultRules.length < networkMapRules.rules.length) continue;

    const startTime = process.hrtime.bigint();
    const spanExecReq = apm.startSpan(`${typologyResults[index].cfg}.exec.Req`);

    const expressionRes = (await databaseManager.getTypologyExpression({
      id: typologyResults[index].id,
      cfg: typologyResults[index].cfg,
      host: '',
      desc: '',
      rules: [],
    })) as unknown[][];

    if (!expressionRes?.[0]?.[0]) {
      loggerService.warn(`No Typology Expression found for Typology ${typologyResults[index].cfg},`, logContext, msgId);
      return {
        typologyResult: typologyResults[index],
        transaction,
        networkMap,
      };
    }

    const expression = expressionRes[0][0] as ITypologyExpression;
    const typologyResultValue = evaluateTypologyExpression(expression.rules, typologyResults[index].ruleResults, expression.expression);

    typologyResults[index].result = typologyResultValue;

    if (expression.workflow.interdictionThreshold)
      typologyResults[index].workflow.interdictionThreshold = expression.workflow.interdictionThreshold;

    if (expression.workflow.alertThreshold) typologyResults[index].workflow.alertThreshold = expression.workflow.alertThreshold;

    typologyResults[index].review = false;

    if (!expression.workflow.alertThreshold) {
      loggerService.error(`Typology ${typologyResults[index].cfg} config missing alert Threshold`, logContext, msgId);
    } else if (typologyResultValue >= expression.workflow.alertThreshold) {
      loggerService.log(
        `Typology ${typologyResults[index].cfg} alerting on transaction : with a trigger of: ${typologyResultValue}`,
        logContext,
        msgId,
      );
      typologyResults[index].review = true;
    }

    cadpReqBody = {
      typologyResult: typologyResults[index],
      transaction,
      networkMap,
    };

    if (expression.workflow.interdictionThreshold && typologyResultValue >= expression.workflow.interdictionThreshold) {
      typologyResults[index].review = true;
      typologyResults[index].prcgTm = CalculateDuration(startTime);

      // Send Typology to CMS
      const spanCms = apm.startSpan(`[${transactionId}] Send Typology result to CMS`);
      server
        .handleResponse({ ...cadpReqBody, metaData }, [configuration.cmsProducer])
        .catch((error) => {
          loggerService.error(`Error while sending Typology result to CMS`, error as Error, logContext, msgId);
        })
        .finally(() => {
          spanExecReq?.end();
          spanCms?.end();
        });
    }

    if (!expression.workflow.alertThreshold) {
      loggerService.error(`Typology ${typologyResults[index].cfg} config missing alert Threshold`, undefined, logContext, msgId);
    } else if (typologyResultValue >= expression.workflow.alertThreshold) {
      loggerService.log(
        `Typology ${typologyResults[index].cfg} alerting on transaction :  with a trigger of: ${typologyResultValue}`,
        logContext,
        msgId,
      );
      typologyResults[index].review = true;
    }
    typologyResults[index].prcgTm = CalculateDuration(startTime);
    cadpReqBody.typologyResult = typologyResults[index];

    // Send Typology to TADProc
    const spanTadpr = apm.startSpan(`[${transactionId}] Send Typology result to TADP`);
    server
      .handleResponse({ ...cadpReqBody, metaData }, [`typology-${networkMapRules ? networkMapRules.cfg : '000@0.0.0'}`])
      .catch((error) => {
        loggerService.error(`Error while sending Typology result to TADP`, error as Error, logContext, msgId);
      })
      .finally(() => {
        spanExecReq?.end();
        spanTadpr?.end();
      });
  }
  return cadpReqBody;
};

export const handleTransaction = async (transaction: any): Promise<void> => {
  const context = 'handleTransaction()';
  const metaData = transaction.metaData;
  const apmTransaction = apm.startTransaction('typroc.handleTransaction', {
    childOf: metaData?.traceParent,
  });

  const networkMap: NetworkMap = transaction.networkMap;
  const ruleResult: RuleResult = transaction.ruleResult;
  const parsedTrans = transaction.transaction;

  const transactionType = 'FIToFIPmtSts';

  const id = parsedTrans[transactionType].GrpHdr.MsgId as string;
  loggerService.log('tx received', context, id);

  const transactionId = parsedTrans[transactionType].GrpHdr.MsgId;
  const cacheKey = `TP_${String(transactionId)}`;

  // Save the rules Result to Redis and continue with the available
  const rulesList: RuleResult[] | undefined = await saveToRedisGetAll(cacheKey, ruleResult);

  if (!rulesList) {
    loggerService.error('Redis records should never be undefined', undefined, context, id);
    return;
  }

  // Aggregations of typology config merge with rule result
  const { typologyResult, ruleCount } = ruleResultAggregation(networkMap, rulesList, ruleResult);

  // Typology evaluation and Send to TADP interdiction determining
  await evaluateTypologySendRequest(
    typologyResult,
    networkMap,
    parsedTrans,
    metaData as MetaData,
    cacheKey,
    {
      storedRules: rulesList.length,
      totalRules: ruleCount,
    },
    id,
  );

  // Garbage collection
  if (rulesList.length >= ruleCount) {
    const spanDelete = apm.startSpan(`cache.delete.[${String(transactionId)}].Typology interim cache key`);
    databaseManager.deleteKey(cacheKey);
    apmTransaction?.end();
    spanDelete?.end();
  }
};
