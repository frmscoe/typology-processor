// SPDX-License-Identifier: Apache-2.0

import { loggerService } from '..';
import { type IExpression, type IRuleValue } from '../interfaces/iTypologyExpression';
import { type RuleResult } from '@frmscoe/frms-coe-lib/lib/interfaces';

export const evaluateTypologyExpression = (
  ruleValues: IRuleValue[],
  ruleResults: RuleResult[],
  typologyExpression: IExpression,
): number => {
  let toReturn = 0.0;
  // eslint-disable-next-line @typescript-eslint/no-for-in-array
  for (const rule in typologyExpression.terms) {
    const ruleResult = ruleResults.find((r) => r.id === typologyExpression.terms[rule].id && r.cfg === typologyExpression.terms[rule].cfg);
    let ruleVal = 0.0;
    if (!ruleResult) {
      loggerService.warn(
        `Could not find rule result for typology expression's term ${typologyExpression.terms[rule].id}${typologyExpression.terms[rule].cfg}`,
      );
      return ruleVal;
    }
    ruleVal = Number(
      ruleValues.find(
        (rv) =>
          rv.id === typologyExpression.terms[rule].id && rv.cfg === typologyExpression.terms[rule].cfg && rv.ref === ruleResult.subRuleRef,
      )?.wght ?? 0.0,
    );
    ruleResult.wght = ruleVal;
    switch (typologyExpression.operator) {
      case '+':
        toReturn += ruleVal;
        break;
      case '-':
        toReturn -= ruleVal;
        break;
      case '*':
        toReturn *= ruleVal;
        break;
      case '/':
        if (ruleVal === 0.0) break;
        toReturn /= ruleVal;
        break;
    }
  }
  if (typologyExpression.expression) {
    const evalRes = evaluateTypologyExpression(ruleValues, ruleResults, typologyExpression.expression);
    switch (typologyExpression.operator) {
      case '+':
        toReturn += evalRes;
        break;
      case '-':
        toReturn -= evalRes;
        break;
      case '*':
        toReturn *= evalRes;
        break;
      case '/':
        if (evalRes === 0.0) break;
        toReturn /= evalRes;
        break;
    }
  }
  return toReturn;
};
