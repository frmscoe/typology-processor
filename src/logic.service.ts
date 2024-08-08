// SPDX-License-Identifier: Apache-2.0
import apm from './apm';
import { CalculateDuration } from '@frmscoe/frms-coe-lib/lib/helpers/calculatePrcg';
import { type NetworkMap, type RuleResult } from '@frmscoe/frms-coe-lib/lib/interfaces';
import { type MetaData } from '@frmscoe/frms-coe-lib/lib/interfaces/metaData';
import { type TADPRequest } from '@frmscoe/frms-coe-lib/lib/interfaces/processor-files/TADPRequest';
import { type TypologyResult } from '@frmscoe/frms-coe-lib/lib/interfaces/processor-files/TypologyResult';
import { databaseManager, loggerService, server } from '.';
import { configuration } from './config';
import { type ITypologyExpression } from '@frmscoe/frms-coe-lib/lib/interfaces/processor-files/TypologyConfig';
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
  const allRuleSet = new Set();
  networkMap.messages.forEach((message) => {
    message.typologies.forEach((typology) => {
      const set = new Set();
      for (const rule of typology.rules) {
        set.add(`${rule.id}@${rule.cfg}`);
        allRuleSet.add(`${rule.id}@${rule.cfg}`);
      }
      if (!set.has(`${ruleResult.id}@${ruleResult.cfg}`)) return;
      const ruleResults = ruleList.filter((rule) => set.has(`${rule.id}@${rule.cfg}`)).map((r) => ({ ...r }));
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

  return { typologyResult, ruleCount: allRuleSet.size };
};

const evaluateTypologySendRequest = async (
  typologyResults: TypologyResult[],
  networkMap: NetworkMap,
  /* eslint-disable  @typescript-eslint/no-explicit-any*/
  transaction: any,
  metaData: MetaData,
  transactionId: string,
  msgId: string,
): Promise<void> => {
  const logContext = 'evaluateTypologySendRequest()';
  for (let index = 0; index < typologyResults.length; index++) {
    // Typology Wait for enough rules if they are not matching the number configured
    const networkMapRules = networkMap.messages[0].typologies.find(
      (typology) => typology.cfg === typologyResults[index].cfg && typology.id === typologyResults[index].id,
    );
    const typologyResultRules = typologyResults[index].ruleResults;
    if (networkMapRules && typologyResultRules.length < networkMapRules.rules.length) continue;

    const startTime = process.hrtime.bigint();
    const spanExecReq = apm.startSpan(`${typologyResults[index].cfg}.exec.Req`);

    const expressionRes = (await databaseManager.getTypologyConfig({
      id: typologyResults[index].id,
      cfg: typologyResults[index].cfg,
      host: '',
      desc: '',
      rules: [],
    })) as unknown[][];

    if (!expressionRes?.[0]?.[0]) {
      loggerService.warn(`No Typology Expression found for Typology ${typologyResults[index].cfg},`, logContext, msgId);
      continue;
    }

    const expression = expressionRes[0][0] as ITypologyExpression;
    const typologyResultValue = evaluateTypologyExpression(expression.rules, typologyResults[index].ruleResults, expression.expression);

    typologyResults[index].result = typologyResultValue;
    typologyResults[index].workflow.interdictionThreshold = expression.workflow.interdictionThreshold;
    typologyResults[index].workflow.alertThreshold = expression.workflow.alertThreshold;
    typologyResults[index].workflow.flowProcessor = expression.workflow.flowProcessor;

    typologyResults[index].review = false;

    if (!typologyResults[index].workflow.alertThreshold) {
      loggerService.error(`Typology ${typologyResults[index].cfg} config missing alert Threshold`, logContext, msgId);
    } else if (typologyResultValue >= typologyResults[index].workflow.alertThreshold) {
      loggerService.log(
        `Typology ${typologyResults[index].cfg} alerting on transaction : with a trigger of: ${typologyResultValue}`,
        logContext,
        msgId,
      );
      typologyResults[index].review = true;
    }

    const tadpReqBody: TADPRequest = {
      typologyResult: typologyResults[index],
      transaction,
      networkMap,
    };

    let efrupStatus: string | undefined;
    let efrupBlockAlert = false;

    if (typologyResults[index].workflow.flowProcessor) {
      // if flowProcessor is defined -> get it's status
      const flowProcessor = typologyResults[index].workflow.flowProcessor;
      efrupStatus = typologyResults[index].ruleResults.find((r) => r.id === flowProcessor)?.subRuleRef;
      if (efrupStatus === 'block') {
        efrupBlockAlert = true;
        typologyResults[index].review = true; // review even if we don't interdict
      } else if (efrupStatus === 'override') {
        efrupBlockAlert = true;
      }
    }

    const isInterdicting =
      typologyResults[index].workflow.interdictionThreshold !== undefined &&
      typologyResultValue >= typologyResults[index].workflow.interdictionThreshold!;

    if (!configuration.suppressAlerts && !efrupBlockAlert && isInterdicting) {
      typologyResults[index].review = true;
      typologyResults[index].prcgTm = CalculateDuration(startTime);
      // Send Typology to CMS
      const spanCms = apm.startSpan(`[${transactionId}] Send Typology result to CMS`);
      server
        .handleResponse({ ...tadpReqBody, metaData }, [configuration.cmsProducer])
        .catch((error) => {
          loggerService.error('Error while sending Typology result to CMS', error as Error, logContext, msgId);
        })
        .finally(() => {
          spanExecReq?.end();
          spanCms?.end();
        });
    }

    typologyResults[index].prcgTm = CalculateDuration(startTime);
    tadpReqBody.typologyResult = typologyResults[index];

    // Send Typology to TADProc
    const spanTadpr = apm.startSpan(`[${transactionId}] Send Typology result to TADP`);
    server
      .handleResponse({ ...tadpReqBody, metaData }, [`typology-${networkMapRules ? networkMapRules.cfg : '000@0.0.0'}`])
      .catch((error) => {
        loggerService.error('Error while sending Typology result to TADP', error as Error, logContext, msgId);
      })
      .finally(() => {
        spanExecReq?.end();
        spanTadpr?.end();
      });
  }
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
  await evaluateTypologySendRequest(typologyResult, networkMap, parsedTrans, metaData as MetaData, cacheKey, id);

  // Garbage collection
  if (rulesList.length >= ruleCount) {
    const spanDelete = apm.startSpan(`cache.delete.[${String(transactionId)}].Typology interim cache key`);
    databaseManager.deleteKey(cacheKey);
    apmTransaction?.end();
    spanDelete?.end();
  }
};
