// SPDX-License-Identifier: Apache-2.0

import { type SemiBoxedExpression } from '@cortex-js/compute-engine';
import { type RuleResult } from '@frmscoe/frms-coe-lib/lib/interfaces';
import { computeEngine, loggerService } from '..';
import { type ExpressionMathJSON, type IRuleValue } from '../interfaces/iTypologyExpression';

export const evaluateTypologyExpression = (
  ruleValues: IRuleValue[],
  ruleResults: RuleResult[],
  typologyExpression: ExpressionMathJSON,
): number => {
  const logContext = 'evaluateTypologyExpression()';
  // Map for efficient rule weight lookup
  const valueMap = new Map<string, [string, number]>();
  ruleValues.forEach((r) => valueMap.set(`${r.id}${r.cfg}${r.ref}`, [r.termId, r.wght]));

  // Map for efficient rule term lookup
  const ruleTermMap = new Map<string, number>();

  ruleResults.forEach((r) => {
    const values = valueMap.get(`${r.id}${r.cfg}${r.subRuleRef}`);
    if (values) {
      const [term, wght] = values;
      ruleTermMap.set(term, wght);
      r.wght = wght;
    }
  });

  const expr: SemiBoxedExpression = replaceTerms(typologyExpression, ruleTermMap);
  const returnValue = computeEngine.box(expr).evaluate();

  if ((returnValue.numericValue as number) === null || returnValue.errors.length > 0) {
    loggerService.error(`Expression evaluated to non numeric number: ${returnValue.toString()}`, logContext);
  }

  return returnValue.numericValue as number;
};

function replaceTerms(arr: ExpressionMathJSON, ruleTermMap: Map<string, number>): ExpressionMathJSON {
  return arr.map((term) => {
    if (typeof term === 'string') {
      const ruleTerm = ruleTermMap.get(term);
      return ruleTerm ?? term;
    } else if (Array.isArray(term)) {
      return replaceTerms(term, ruleTermMap);
    }
    return term;
  });
}
