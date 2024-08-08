// SPDX-License-Identifier: Apache-2.0
/* eslint-disable */
import { NetworkMap, Pacs002, RuleResult, Typology } from '@frmscoe/frms-coe-lib/lib/interfaces';
import { TADPRequest } from '@frmscoe/frms-coe-lib/lib/interfaces/processor-files/TADPRequest';
import { configuration } from '../../src/config';
import { databaseManager, dbInit, runServer, server } from '../../src/index';
import { IRuleValue, ITypologyExpression } from '@frmscoe/frms-coe-lib/lib/interfaces/processor-files/TypologyConfig';
import { handleTransaction } from '../../src/logic.service';
import { evaluateTypologyExpression } from '../../src/utils/evaluateTExpression';

const evaluation = jest.requireActual('../../src/utils/evaluateTExpression');

const getMockReqPacs002 = (): Pacs002 => {
  return JSON.parse(
    '{"TxTp":"pacs.002.001.12","FIToFIPmtSts":{"GrpHdr":{"MsgId":"136a-dbb6-43d8-a565-86b8f322411e","CreDtTm":"2023-02-03T09:53:58.069Z"},"TxInfAndSts":{"OrgnlInstrId":"5d158d92f70142a6ac7ffba30ac6c2db","OrgnlEndToEndId":"701b-ae14-46fd-a2cf-88dda2875fdd","TxSts":"ACCC","ChrgsInf":[{"Amt":{"Amt":307.14,"Ccy":"USD"},"Agt":{"FinInstnId":{"ClrSysMmbId":{"MmbId":"typolog028"}}}},{"Amt":{"Amt":153.57,"Ccy":"USD"},"Agt":{"FinInstnId":{"ClrSysMmbId":{"MmbId":"typolog028"}}}},{"Amt":{"Amt":300.71,"Ccy":"USD"},"Agt":{"FinInstnId":{"ClrSysMmbId":{"MmbId":"dfsp002"}}}}],"AccptncDtTm":"2023-02-03T09:53:58.069Z","InstgAgt":{"FinInstnId":{"ClrSysMmbId":{"MmbId":"typolog028"}}},"InstdAgt":{"FinInstnId":{"ClrSysMmbId":{"MmbId":"dfsp002"}}}}}}',
  );
};

const getMockNetworkMapPacs002 = (): NetworkMap => {
  return JSON.parse(
    `{
      "active": true,
      "cfg": "1.0.0",
      "messages": [
        {
          "id": "004@1.0.0",
          "cfg": "1.0.0",
          "txTp": "pacs.002.001.12",
          "typologies": [
            {
              "id": "typology-processor@1.0.0",
              "cfg": "028@1.0.0",
              "rules": [{ "id": "003@1.0.0", "cfg": "1.0.0" }]
            },
            {
              "id": "typology-processor@1.0.0",
              "cfg": "029@1.0.0",
              "rules": [
                { "id": "003@1.0.0", "cfg": "1.0.0" },
                { "id": "004@1.0.0", "cfg": "1.0.0" }
              ]
            }
          ]
        }
      ]
    }`,
  );
};

const getMockNetworkMapPacs002WithEFRuP = (): NetworkMap => {
  return JSON.parse(
    `{
      "active": true,
      "cfg": "1.0.0",
      "messages": [
        {
          "id": "004@1.0.0",
          "cfg": "1.0.0",
          "txTp": "pacs.002.001.12",
          "typologies": [
            {
              "id": "typology-processor@1.0.0",
              "cfg": "028@1.0.0",
              "rules": [
                { 
                  "id": "003@1.0.0",
                  "cfg": "1.0.0"
                },
                { 
                  "id": "EFRuP@1.0.0",
                  "cfg": "none"
                }
              ]
            }
          ]
        }
      ]
    }`,
  );
};

const getMockTypologyExp028 = (): ITypologyExpression => {
  return JSON.parse(
    `{
      "cfg": "1.0.0",
      "id": "028@1.0.0",
      "workflow": {
          "alertThreshold": "125",
          "interdictionThreshold": "150"
      },
      "rules": [
          {
              "id": "003@1.0.0",
              "cfg": "1.0.0",
              "wghts": [
                  {
                      "ref": ".err",
                      "wght": 0
                  },
                  {
                      "ref": ".01",
                      "wght": 100
                  },
                  {
                      "ref": ".03",
                      "wght": 300
                  },
                  {
                      "ref": ".x00",
                      "wght": 500
                  }
              ],
              "termId": "v003at100at100"
          }
      ],
      "expression": [
          "Add",
          "v003at100at100"
      ]
  }`,
  );
};

const getMockTypologyExp029 = (): ITypologyExpression => {
  return JSON.parse(`{
    "cfg": "1.0.0",
    "id": "029@1.0.0",
    "workflow": {
        "alertThreshold": "350",
        "interdictionThreshold": "700"
    },
    "rules": [
        {
            "id": "003@1.0.0",
            "cfg": "1.0.0",
            "wghts": [
                {
                    "ref": ".err",
                    "wght": 1
                },
                {
                    "ref": ".01",
                    "wght": 101
                },
                {
                    "ref": ".03",
                    "wght": 301
                },
                {
                    "ref": ".x00",
                    "wght": 501
                }
            ],
            "termId": "v003at100at100"
        },
        {
            "id": "004@1.0.0",
            "cfg": "1.0.0",
            "wghts": [
                {
                    "ref": ".err",
                    "wght": 51
                },
                {
                    "ref": ".01",
                    "wght": 151
                },
                {
                    "ref": ".03",
                    "wght": 351
                },
                {
                    "ref": ".x00",
                    "wght": 551
                }
            ],
            "termId": "v004at100at100"
        }
    ],
    "expression": [
        "Add",
        "v003at100at100",
        "v004at100at100"
    ]
}`);
};

beforeAll(async () => {
  await dbInit();
  await runServer();
});

afterAll((done) => {
  done();
});

const cacheStringArr: Map<string, Record<string, unknown>[]> = new Map();

describe('Logic Service', () => {
  let responseSpy: jest.SpyInstance;
  let addOneGetAllSpy: jest.SpyInstance;
  let getTypologyConfigSpy: jest.SpyInstance;
  let deleteKeySpy: jest.SpyInstance;

  beforeEach(() => {
    addOneGetAllSpy = jest
      .spyOn(databaseManager, 'addOneGetAll')
      .mockImplementation((key: string, value: Record<string, unknown>): Promise<Array<Record<string, unknown>>> => {
        return new Promise<Record<string, unknown>[]>((resolve, _reject) => {
          if (cacheStringArr.get(key)) {
            // Care for value dupes
            cacheStringArr.get(key)!.push(value);
          } else {
            cacheStringArr.set(key, [value]);
          }
          resolve(cacheStringArr.get(key) ?? []);
        });
      });

    getTypologyConfigSpy = jest.spyOn(databaseManager, 'getTypologyConfig').mockImplementation(async (_typology: Typology) => {
      switch (_typology.cfg) {
        case '028@1.0.0': {
          return new Promise((resolve, _reject) => {
            resolve([[getMockTypologyExp028()]]);
          });
        }
        case '029@1.0.0': {
          return new Promise((resolve, _reject) => {
            resolve([[getMockTypologyExp029()]]);
          });
        }
        default: {
          return new Promise((resolve, _reject) => {
            throw new Error('Extend getTypologyConfig Case');
          });
        }
      }
    });

    deleteKeySpy = jest.spyOn(databaseManager, 'deleteKey').mockImplementation((key: string): Promise<void> => {
      return new Promise<void>((resolve, _reject) => {
        cacheStringArr.delete(key);
        resolve();
      });
    });

    responseSpy = jest.spyOn(server, 'handleResponse').mockImplementation((response: any, _subject: string[] | undefined): any => {
      return new Promise((resolve, _reject) => {
        resolve(response);
      });
    });
  });

  afterEach(() => {
    // Clear 'Redis'
    cacheStringArr.clear();
  });

  describe('Handle Transaction', () => {
    it('should handle successful request, TP028, Rules 1/1', async () => {
      const Req = getMockReqPacs002();

      const networkMap: NetworkMap = getMockNetworkMapPacs002();
      const ruleResult: RuleResult = {
        prcgTm: 0,
        id: '003@1.0.0',
        cfg: '1.0.0',
        reason: 'reason',
        subRuleRef: '.01',
      };

      await handleTransaction({
        transaction: Req,
        networkMap,
        ruleResult,
      });

      expect(getTypologyConfigSpy).toHaveBeenCalledTimes(1);
      expect(addOneGetAllSpy).toHaveBeenCalledTimes(1);
      expect(deleteKeySpy).toHaveBeenCalledTimes(0);
      expect(responseSpy).toHaveBeenCalledTimes(1);
      expect(responseSpy.mock.results.length).toEqual(1);

      const typology028Shallow = await responseSpy.mock.results[0].value;
      expect(typology028Shallow.networkMap).toEqual(networkMap);
      expect(typology028Shallow.transaction).toEqual(Req);
      expect(typology028Shallow.typologyResult.ruleResults.length).toEqual(1);
      expect(typology028Shallow.typologyResult.ruleResults[0]).toEqual({ ...ruleResult, wght: 100 });
      expect(typology028Shallow.typologyResult.result).toEqual(100);
    });

    it('should handle successful request, TP028+TP029, Rules 2/2 and Typologies 2/2', async () => {
      const Req = getMockReqPacs002();

      const networkMap: NetworkMap = getMockNetworkMapPacs002();
      const ruleResult: RuleResult = {
        prcgTm: 0,
        id: '003@1.0.0',
        cfg: '1.0.0',
        reason: 'reason',
        subRuleRef: '.01',
      };

      await handleTransaction({
        transaction: Req,
        networkMap,
        ruleResult,
      });

      expect(getTypologyConfigSpy).toHaveBeenCalledTimes(1);
      expect(addOneGetAllSpy).toHaveBeenCalledTimes(1);
      expect(deleteKeySpy).toHaveBeenCalledTimes(0);
      expect(responseSpy).toHaveBeenCalledTimes(1);
      expect(responseSpy.mock.results.length).toEqual(1);

      let typology028 = await responseSpy.mock.results[0].value;
      expect(typology028.networkMap).toEqual(networkMap);
      expect(typology028.transaction).toEqual(Req);
      expect(typology028.typologyResult.ruleResults.length).toEqual(1);
      expect(typology028.typologyResult.ruleResults[0]).toEqual({ ...ruleResult, wght: 100 });
      expect(typology028.typologyResult.result).toEqual(100);

      const ruleResultTwo: RuleResult = {
        prcgTm: 0,
        id: '004@1.0.0',
        cfg: '1.0.0',
        reason: 'reason',
        subRuleRef: '.01',
      };

      await handleTransaction({
        transaction: Req,
        networkMap,
        ruleResult: ruleResultTwo,
      });

      expect(getTypologyConfigSpy).toHaveBeenCalledTimes(2);
      expect(addOneGetAllSpy).toHaveBeenCalledTimes(2);
      expect(deleteKeySpy).toHaveBeenCalledTimes(1);
      expect(responseSpy).toHaveBeenCalledTimes(2);
      expect(responseSpy.mock.results.length).toEqual(2);

      typology028 = await responseSpy.mock.results[0].value;
      expect(typology028.networkMap).toEqual(networkMap);
      expect(typology028.transaction).toEqual(Req);
      expect(typology028.typologyResult.ruleResults.length).toEqual(1);
      expect(typology028.typologyResult.ruleResults[0]).toEqual({ ...ruleResult, wght: 100 });
      expect(typology028.typologyResult.result).toEqual(100);

      const typology029 = await responseSpy.mock.results[1].value;
      expect(typology029.networkMap).toEqual(networkMap);
      expect(typology029.transaction).toEqual(Req);
      expect(typology029.typologyResult.ruleResults.length).toEqual(2);
      expect(typology029.typologyResult.ruleResults[0]).toEqual({ ...ruleResult, wght: 101 });
      expect(typology029.typologyResult.ruleResults[1]).toEqual({ ...ruleResultTwo, wght: 151 });
      expect(typology029.typologyResult.result).toEqual(252);
    });

    it('should handle nested typology expressions using "+"', async () => {
      const Req = getMockReqPacs002();

      getTypologyConfigSpy.mockRestore();
      getTypologyConfigSpy = jest.spyOn(databaseManager, 'getTypologyConfig').mockImplementationOnce(async (_typology: Typology) => {
        return new Promise((resolve, _reject) =>
          resolve([
            [
              {
                cfg: '1.0.0',
                id: '030@1.0.0',
                workflow: { alertThreshold: '2000', interdictionThreshold: '4000' },
                rules: [
                  {
                    id: '003@1.0.0',
                    cfg: '1.0.0',
                    wghts: [
                      {
                        ref: '.01',
                        wght: 100,
                      },
                    ],
                    termId: 'v003at100at100',
                  },
                  {
                    id: '004@1.0.0',
                    cfg: '1.0.0',
                    wghts: [
                      {
                        ref: '.01',
                        wght: 50,
                      },
                    ],
                    termId: 'v004at100at100',
                  },
                  {
                    id: '005@1.0.0',
                    cfg: '1.0.0',
                    wghts: [
                      {
                        ref: '.01',
                        wght: 25,
                      },
                    ],
                    termId: 'v005at100at100',
                  },
                ],
                expression: [
                  'Add',
                  'v003at100at100',
                  'v004at100at100',
                  'v005at100at100',
                  ['Add', 'v003at100at100', 'v004at100at100', 'v005at100at100'],
                ],
              },
            ],
          ]),
        );
      });

      const localNetworkMap = JSON.parse(
        '{"active":true,"cfg":"1.0.0","messages":[{"id":"004@1.0.0","cfg":"1.0.0","txTp":"pacs.002.001.12","typologies":[{"id":"typology-processor@1.0.0","cfg":"030@1.0.0","rules":[{"id":"003@1.0.0","cfg":"1.0.0"},{"id":"004@1.0.0","cfg":"1.0.0"},{"id":"005@1.0.0","cfg":"1.0.0"}]}]}]}',
      );
      const networkMap: NetworkMap = Object.assign(new NetworkMap(), localNetworkMap);
      const ruleResult03: RuleResult = {
        prcgTm: 0,
        id: '003@1.0.0',
        cfg: '1.0.0',
        reason: 'reason',
        subRuleRef: '.01',
      };

      const ruleResult04: RuleResult = {
        prcgTm: 0,
        id: '004@1.0.0',
        cfg: '1.0.0',
        reason: 'reason',
        subRuleRef: '.01',
      };

      const ruleResult05: RuleResult = {
        prcgTm: 0,
        id: '005@1.0.0',
        cfg: '1.0.0',
        reason: 'reason',
        subRuleRef: '.01',
      };

      await handleTransaction({ transaction: Req, networkMap, ruleResult: ruleResult03 });
      await handleTransaction({ transaction: Req, networkMap, ruleResult: ruleResult04 });
      await handleTransaction({ transaction: Req, networkMap, ruleResult: ruleResult05 });

      expect(getTypologyConfigSpy).toHaveBeenCalledTimes(1);
      expect(addOneGetAllSpy).toHaveBeenCalledTimes(3);
      expect(deleteKeySpy).toHaveBeenCalledTimes(1); // Completed all rules in network map
      expect(responseSpy).toHaveBeenCalledTimes(1);
      expect(responseSpy.mock.results.length).toEqual(1);

      const typology030 = await responseSpy.mock.results[0].value;
      expect(typology030.networkMap).toEqual(networkMap);
      expect(typology030.transaction).toEqual(Req);
      expect(typology030.typologyResult.ruleResults.length).toEqual(3);
      expect(typology030.typologyResult.ruleResults[0]).toEqual({ ...ruleResult03, wght: 100 });
      expect(typology030.typologyResult.ruleResults[1]).toEqual({ ...ruleResult04, wght: 50 });
      expect(typology030.typologyResult.ruleResults[2]).toEqual({ ...ruleResult05, wght: 25 });
      expect(typology030.typologyResult.result).toEqual(350); // Nested expression is parental repeat ie. (100 + 50 + 25) + (100 + 50 + 25)
    });

    it('should handle successful request, TP028, Rules 1/1, Interdicting', async () => {
      const Req = getMockReqPacs002();

      getTypologyConfigSpy = jest.spyOn(databaseManager, 'getTypologyConfig').mockImplementationOnce(async (_typology: Typology) => {
        return new Promise((resolve, _reject) => {
          resolve([
            [
              JSON.parse(
                '{"cfg":"1.0.0","id":"028@1.0.0","workflow":{"alertThreshold":"10","interdictionThreshold":"20"},"rules":[{"id":"003@1.0.0","cfg":"1.0.0","wghts":[{"ref":".01","wght":20}],"termId":"v003at100at100"}],"expression":["Add","v003at100at100"]}',
              ),
            ],
          ]);
        });
      });

      const networkMap: NetworkMap = getMockNetworkMapPacs002();
      const ruleResult: RuleResult = {
        prcgTm: 0,
        id: '003@1.0.0',
        cfg: '1.0.0',
        reason: 'reason',
        subRuleRef: '.01',
      };

      await handleTransaction({
        transaction: Req,
        networkMap,
        ruleResult,
      });

      expect(getTypologyConfigSpy).toHaveBeenCalledTimes(1);
      expect(addOneGetAllSpy).toHaveBeenCalledTimes(1);
      expect(deleteKeySpy).toHaveBeenCalledTimes(0);
      expect(responseSpy).toHaveBeenCalledTimes(2); // +1 to CMS for interdiction
      expect(responseSpy.mock.results.length).toEqual(2);

      const typology028 = await responseSpy.mock.results[0].value;
      expect(typology028.networkMap).toEqual(networkMap);
      expect(typology028.transaction).toEqual(Req);
      expect(typology028.typologyResult.ruleResults.length).toEqual(1);
      expect(typology028.typologyResult.ruleResults[0]).toEqual({ ...ruleResult, wght: 20 });
      expect(typology028.typologyResult.result).toEqual(20);

      const typology028CMS = await responseSpy.mock.results[1].value;
      expect(typology028CMS.networkMap).toEqual(networkMap);
      expect(typology028CMS.transaction).toEqual(Req);
      expect(typology028CMS.typologyResult.ruleResults.length).toEqual(1);
      expect(typology028CMS.typologyResult.ruleResults[0]).toEqual({ ...ruleResult, wght: 20 });
      expect(typology028CMS.typologyResult.result).toEqual(20);
    });

    it('should handle successful request, TP028, Rules 1/1, Interdicting. Suppressed', async () => {
      const Req = getMockReqPacs002();

      configuration.suppressAlerts = true;

      getTypologyConfigSpy = jest.spyOn(databaseManager, 'getTypologyConfig').mockImplementationOnce(async (_typology: Typology) => {
        return new Promise((resolve, _reject) => {
          resolve([
            [
              JSON.parse(
                '{"cfg":"1.0.0","id":"028@1.0.0","workflow":{"alertThreshold":"10","interdictionThreshold":"20"},"rules":[{"id":"003@1.0.0","cfg":"1.0.0","wghts":[{"ref":".01","wght":20}],"termId":"v003at100at100"}],"expression":["Add","v003at100at100"]}',
              ),
            ],
          ]);
        });
      });

      const networkMap: NetworkMap = getMockNetworkMapPacs002();
      const ruleResult: RuleResult = {
        prcgTm: 0,
        id: '003@1.0.0',
        cfg: '1.0.0',
        reason: 'reason',
        subRuleRef: '.01',
      };

      await handleTransaction({
        transaction: Req,
        networkMap,
        ruleResult,
      });

      expect(getTypologyConfigSpy).toHaveBeenCalledTimes(1);
      expect(addOneGetAllSpy).toHaveBeenCalledTimes(1);
      expect(deleteKeySpy).toHaveBeenCalledTimes(0);
      expect(responseSpy).toHaveBeenCalledTimes(1); // Suppressed CMS
      expect(responseSpy.mock.results.length).toEqual(1); // Suppressed CMS

      const typology028 = await responseSpy.mock.results[0].value;
      expect(typology028.networkMap).toEqual(networkMap);
      expect(typology028.transaction).toEqual(Req);
      expect(typology028.typologyResult.ruleResults.length).toEqual(1);
      expect(typology028.typologyResult.ruleResults[0]).toEqual({ ...ruleResult, wght: 20 });
      expect(typology028.typologyResult.result).toEqual(20);

      configuration.suppressAlerts = false;
    });

    it('should handle successful request, with a unmatched ruleId', async () => {
      const Req = getMockReqPacs002();

      const networkMap: NetworkMap = getMockNetworkMapPacs002();

      const badRuleResult: RuleResult = {
        prcgTm: 0,
        id: '001_Derived_account_age_payee',
        cfg: '1.0.0',
        reason: 'reason',
        subRuleRef: 'ref1',
      };

      await handleTransaction({ transaction: Req, ruleResult: badRuleResult, networkMap: networkMap });
      expect(getTypologyConfigSpy).toHaveBeenCalledTimes(0);
      expect(addOneGetAllSpy).toHaveBeenCalledTimes(1);
      expect(deleteKeySpy).toHaveBeenCalledTimes(0);
      expect(responseSpy).toHaveBeenCalledTimes(0);
    });

    it('should handle successful request, getTypologyConfig error', async () => {
      const Req = getMockReqPacs002();

      const networkMap: NetworkMap = getMockNetworkMapPacs002();
      const ruleResult: RuleResult = {
        prcgTm: 0,
        id: '003@1.0.0',
        cfg: '1.0.0',
        reason: 'reason',
        subRuleRef: '.01',
      };

      jest.spyOn(databaseManager, 'getTypologyConfig').mockRejectedValue(async (_typology: Typology) => {
        return new Promise((resolve, _reject) => {
          resolve(new Error('Test'));
        });
      });

      try {
        await handleTransaction({ transaction: Req, networkMap, ruleResult });
      } catch {
        console.log('Error handle transaction');
      }

      expect(getTypologyConfigSpy).toHaveBeenCalledTimes(1);
      expect(addOneGetAllSpy).toHaveBeenCalledTimes(1);
      expect(deleteKeySpy).toHaveBeenCalledTimes(0);
      expect(responseSpy).toHaveBeenCalledTimes(0);
    });

    it('should handle successful request, undefined typology expression', async () => {
      const Req = getMockReqPacs002();

      const networkMap: NetworkMap = getMockNetworkMapPacs002();
      const ruleResult: RuleResult = {
        prcgTm: 0,
        id: '003@1.0.0',
        cfg: '1.0.0',
        reason: 'reason',
        subRuleRef: 'ref1',
      };

      jest.spyOn(databaseManager, 'getTypologyConfig').mockImplementation(async (_typology: Typology) => {
        return new Promise((resolve, _reject) => {
          resolve([[]]);
        });
      });

      await handleTransaction({ transaction: Req, networkMap, ruleResult });
      expect(getTypologyConfigSpy).toHaveBeenCalledTimes(1);
      expect(addOneGetAllSpy).toHaveBeenCalledTimes(1);
      expect(deleteKeySpy).toHaveBeenCalledTimes(0);
      expect(responseSpy).toHaveBeenCalledTimes(0);
    });

    it('should handle successful request, cms and tadproc result error', async () => {
      const Req = getMockReqPacs002();

      const networkMap: NetworkMap = getMockNetworkMapPacs002();
      const ruleResult03: RuleResult = {
        prcgTm: 0,
        id: '003@1.0.0',
        cfg: '1.0.0',
        reason: 'reason',
        subRuleRef: '.01',
      };

      responseSpy.mockImplementation().mockReturnValue(new Error('Test Failure Path'));

      try {
        await handleTransaction({ transaction: Req, networkMap, ruleResult: ruleResult03 });
        // Should error before
        expect(true).toEqual(false);
      } catch {
        console.log('Error of handling of transaction');
        expect(true).toEqual(true);
      }

      expect(getTypologyConfigSpy).toHaveBeenCalledTimes(1);
      expect(addOneGetAllSpy).toHaveBeenCalledTimes(1);
      expect(deleteKeySpy).toHaveBeenCalledTimes(0);
      expect(responseSpy).toHaveBeenCalledTimes(1);
    });

    it('Should handle failure to post to TADP', async () => {
      const Req = getMockReqPacs002();

      const networkMap: NetworkMap = getMockNetworkMapPacs002();
      const ruleResult: RuleResult = {
        prcgTm: 0,
        id: '003@1.0.0',
        cfg: '1.0.0',
        reason: 'reason',
        subRuleRef: '.01',
      };

      const errorSpy = jest.spyOn(server, 'handleResponse').mockRejectedValue(() => {
        throw new Error('Testing purposes');
      });

      try {
        await handleTransaction({
          transaction: Req,
          networkMap,
          ruleResult,
        });
      } catch (err) {
        // Error should not bubble up
        expect(true).toEqual(false);
      }

      expect(getTypologyConfigSpy).toHaveBeenCalledTimes(1);
      expect(addOneGetAllSpy).toHaveBeenCalledTimes(1);
      expect(deleteKeySpy).toHaveBeenCalledTimes(0);
      expect(errorSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('Review flag, alerts, and interdiction', () => {
    afterEach(() => {
      jest.spyOn(evaluation, 'evaluateTypologyExpression').mockRestore();
    });

    it('no EFRuP, no alertThreshold breach, not interdicting - review false', async () => {
      const Req = getMockReqPacs002();

      const networkMap: NetworkMap = getMockNetworkMapPacs002();
      const ruleResult: RuleResult = {
        prcgTm: 0,
        id: '003@1.0.0',
        cfg: '1.0.0',
        reason: 'reason',
        subRuleRef: '.01',
      };

      await handleTransaction({
        transaction: Req,
        networkMap,
        ruleResult,
      });

      expect(responseSpy).toHaveBeenCalledTimes(1);
      expect(responseSpy.mock.results.length).toEqual(1);

      const tadpRequest: TADPRequest = await responseSpy.mock.results[0].value;
      expect(tadpRequest.typologyResult.review).toEqual(false);
    });

    it('no EFRuP, alertThreshold breached, not interdicting - review true', async () => {
      const Req = getMockReqPacs002();

      const networkMap: NetworkMap = getMockNetworkMapPacs002();

      // larger than or equal to 125 (alert) but not 150 (interdict)
      jest.spyOn(evaluation, 'evaluateTypologyExpression').mockReturnValueOnce(125);

      const ruleResult: RuleResult = {
        prcgTm: 0,
        id: '003@1.0.0',
        cfg: '1.0.0',
        reason: 'reason',
        subRuleRef: '.01',
      };

      await handleTransaction({
        transaction: Req,
        networkMap,
        ruleResult,
      });

      expect(responseSpy).toHaveBeenCalledTimes(1);
      expect(responseSpy.mock.results.length).toEqual(1);

      const tadpRequest: TADPRequest = await responseSpy.mock.results[0].value;
      expect(tadpRequest.typologyResult.review).toEqual(true);
    });

    it('no EFRuP, interdicting - review true', async () => {
      const Req = getMockReqPacs002();

      const networkMap: NetworkMap = getMockNetworkMapPacs002();

      // larger than or equal to 150 (interdict)
      jest.spyOn(evaluation, 'evaluateTypologyExpression').mockReturnValueOnce(175);

      const ruleResult: RuleResult = {
        prcgTm: 0,
        id: '003@1.0.0',
        cfg: '1.0.0',
        reason: 'reason',
        subRuleRef: '.01',
      };

      await handleTransaction({
        transaction: Req,
        networkMap,
        ruleResult,
      });

      expect(responseSpy).toHaveBeenCalledTimes(2); // +1 interdiction call
      expect(responseSpy.mock.results.length).toEqual(2);

      // results[0] is CMS's shallow copy so we only test results[1]
      const tadpRequest: TADPRequest = await responseSpy.mock.results[1].value;
      expect(tadpRequest.typologyResult.review).toEqual(true);
    });

    it('EFRuP - block, no alertThreshold breach, not interdicting - review true', async () => {
      const Req = getMockReqPacs002();

      const networkMap: NetworkMap = getMockNetworkMapPacs002WithEFRuP();

      getTypologyConfigSpy = jest.spyOn(databaseManager, 'getTypologyConfig').mockImplementationOnce(async (_typology: Typology) => {
        return new Promise((resolve, _reject) =>
          resolve([
            [
              {
                cfg: '1.0.0',
                id: '030@1.0.0',
                workflow: {
                  alertThreshold: 125,
                  interdictionThreshold: 150,
                  flowProcessor: 'EFRuP@1.0.0',
                },
                rules: [
                  {
                    id: '003@1.0.0',
                    cfg: '1.0.0',
                    wghts: [
                      {
                        ref: '.01',
                        wght: 100,
                      },
                    ],
                    termId: 'v003at100at100',
                  },
                  {
                    id: 'EFRuP@1.0.0',
                    cfg: 'none',
                    wghts: [
                      {
                        ref: 'block',
                        wght: 0,
                      },
                      {
                        ref: 'override',
                        wght: 0,
                      },
                      {
                        ref: 'none',
                        wght: 0,
                      },
                    ],
                    termId: 'vEFRuPat100at100',
                  },
                ],
                expression: ['Add', 'v003at100at100'],
              },
            ],
          ]),
        );
      });

      const ruleResult: RuleResult = {
        id: '003@1.0.0',
        cfg: '1.0.0',
        reason: 'reason',
        subRuleRef: '.01',
      };

      await handleTransaction({
        transaction: Req,
        networkMap,
        ruleResult,
      });

      expect(responseSpy).toHaveBeenCalledTimes(0);

      const efrupResult: RuleResult = {
        id: 'EFRuP@1.0.0',
        cfg: 'none',
        subRuleRef: 'block',
      };

      await handleTransaction({
        transaction: Req,
        networkMap,
        ruleResult: efrupResult,
      });

      expect(responseSpy).toHaveBeenCalledTimes(1);
      expect(responseSpy.mock.results.length).toEqual(1);

      const tadpRequest: TADPRequest = await responseSpy.mock.results[0].value;
      expect(tadpRequest.typologyResult.review).toEqual(true);
      expect(tadpRequest.typologyResult.ruleResults).toContainEqual({ ...efrupResult, wght: 0 });
    });

    it('EFRuP - block, alertThreshold breached, not interdicting - review true', async () => {
      const Req = getMockReqPacs002();

      const networkMap: NetworkMap = getMockNetworkMapPacs002WithEFRuP();

      getTypologyConfigSpy = jest.spyOn(databaseManager, 'getTypologyConfig').mockImplementationOnce(async (_typology: Typology) => {
        return new Promise((resolve, _reject) =>
          resolve([
            [
              {
                cfg: '1.0.0',
                id: '030@1.0.0',
                workflow: {
                  alertThreshold: 125,
                  interdictionThreshold: 150,
                  flowProcessor: 'EFRuP@1.0.0',
                },
                rules: [
                  {
                    id: '003@1.0.0',
                    cfg: '1.0.0',
                    wghts: [
                      {
                        ref: '.01',
                        wght: 100,
                      },
                    ],
                    termId: 'v003at100at100',
                  },
                  {
                    id: 'EFRuP@1.0.0',
                    cfg: 'none',
                    wghts: [
                      {
                        ref: 'block',
                        wght: 0,
                      },
                      {
                        ref: 'override',
                        wght: 0,
                      },
                      {
                        ref: 'none',
                        wght: 0,
                      },
                    ],
                    termId: 'vEFRuPat100at100',
                  },
                ],
                expression: ['Add', 'v003at100at100'],
              },
            ],
          ]),
        );
      });

      // larger than or equal to 125 (alert) but not 150 (interdict)
      jest.spyOn(evaluation, 'evaluateTypologyExpression').mockReturnValueOnce(125);

      const ruleResult: RuleResult = {
        id: '003@1.0.0',
        cfg: '1.0.0',
        reason: 'reason',
        subRuleRef: '.01',
      };

      await handleTransaction({
        transaction: Req,
        networkMap,
        ruleResult,
      });

      expect(responseSpy).toHaveBeenCalledTimes(0);

      const efrupResult: RuleResult = {
        id: 'EFRuP@1.0.0',
        cfg: 'none',
        subRuleRef: 'block',
      };

      await handleTransaction({
        transaction: Req,
        networkMap,
        ruleResult: efrupResult,
      });

      expect(responseSpy).toHaveBeenCalledTimes(1);
      expect(responseSpy.mock.results.length).toEqual(1);

      const tadpRequest: TADPRequest = await responseSpy.mock.results[0].value;
      expect(tadpRequest.typologyResult.review).toEqual(true);
      expect(tadpRequest.typologyResult.ruleResults).toContainEqual(efrupResult); // evaluateTypologyExpression mock doesn't set wght's for ruleResults
    });

    it('EFRuP - block, interdicting - review true', async () => {
      const Req = getMockReqPacs002();

      const networkMap: NetworkMap = getMockNetworkMapPacs002WithEFRuP();

      getTypologyConfigSpy = jest.spyOn(databaseManager, 'getTypologyConfig').mockImplementationOnce(async (_typology: Typology) => {
        return new Promise((resolve, _reject) =>
          resolve([
            [
              {
                cfg: '1.0.0',
                id: '030@1.0.0',
                workflow: {
                  alertThreshold: 125,
                  interdictionThreshold: 150,
                  flowProcessor: 'EFRuP@1.0.0',
                },
                rules: [
                  {
                    id: '003@1.0.0',
                    cfg: '1.0.0',
                    wghts: [
                      {
                        ref: '.01',
                        wght: 100,
                      },
                    ],
                    termId: 'v003at100at100',
                  },
                  {
                    id: 'EFRuP@1.0.0',
                    cfg: 'none',
                    wghts: [
                      {
                        ref: 'block',
                        wght: 0,
                      },
                      {
                        ref: 'override',
                        wght: 0,
                      },
                      {
                        ref: 'none',
                        wght: 0,
                      },
                    ],
                    termId: 'vEFRuPat100at100',
                  },
                ],
                expression: ['Add', 'v003at100at100'],
              },
            ],
          ]),
        );
      });

      // larger than or equal to 150 (interdict)
      jest.spyOn(evaluation, 'evaluateTypologyExpression').mockReturnValueOnce(175);

      const ruleResult: RuleResult = {
        id: '003@1.0.0',
        cfg: '1.0.0',
        reason: 'reason',
        subRuleRef: '.01',
      };

      await handleTransaction({
        transaction: Req,
        networkMap,
        ruleResult,
      });

      expect(responseSpy).toHaveBeenCalledTimes(0);

      const efrupResult: RuleResult = {
        id: 'EFRuP@1.0.0',
        cfg: 'none',
        subRuleRef: 'block',
      };

      await handleTransaction({
        transaction: Req,
        networkMap,
        ruleResult: efrupResult,
      });

      expect(responseSpy).toHaveBeenCalledTimes(1); // -1 block blocks interdiction
      expect(responseSpy.mock.results.length).toEqual(1);

      const tadpRequest: TADPRequest = await responseSpy.mock.results[0].value;
      expect(tadpRequest.typologyResult.review).toEqual(true);
      expect(tadpRequest.typologyResult.ruleResults).toContainEqual(efrupResult); // evaluateTypologyExpression mock doesn't set wght's for ruleResults
    });

    it('EFRuP - override, no alertThreshold breach, not interdicting - review false', async () => {
      const Req = getMockReqPacs002();

      const networkMap: NetworkMap = getMockNetworkMapPacs002WithEFRuP();

      getTypologyConfigSpy = jest.spyOn(databaseManager, 'getTypologyConfig').mockImplementationOnce(async (_typology: Typology) => {
        return new Promise((resolve, _reject) =>
          resolve([
            [
              {
                cfg: '1.0.0',
                id: '030@1.0.0',
                workflow: {
                  alertThreshold: '2000',
                  interdictionThreshold: '4000',
                  flowProcessor: 'EFRuP@1.0.0',
                },
                rules: [
                  {
                    id: '003@1.0.0',
                    cfg: '1.0.0',
                    wghts: [
                      {
                        ref: '.01',
                        wght: 100,
                      },
                    ],
                    termId: 'v003at100at100',
                  },
                  {
                    id: 'EFRuP@1.0.0',
                    cfg: 'none',
                    wghts: [
                      {
                        ref: 'block',
                        wght: 0,
                      },
                      {
                        ref: 'override',
                        wght: 0,
                      },
                      {
                        ref: 'none',
                        wght: 0,
                      },
                    ],
                    termId: 'vEFRuPat100at100',
                  },
                ],
                expression: ['Add', 'v003at100at100'],
              },
            ],
          ]),
        );
      });

      const ruleResult: RuleResult = {
        id: '003@1.0.0',
        cfg: '1.0.0',
        reason: 'reason',
        subRuleRef: '.01',
      };

      await handleTransaction({
        transaction: Req,
        networkMap,
        ruleResult,
      });

      expect(responseSpy).toHaveBeenCalledTimes(0);

      const efrupResult: RuleResult = {
        id: 'EFRuP@1.0.0',
        cfg: 'none',
        subRuleRef: 'override',
      };

      await handleTransaction({
        transaction: Req,
        networkMap,
        ruleResult: efrupResult,
      });

      expect(responseSpy).toHaveBeenCalledTimes(1);
      expect(responseSpy.mock.results.length).toEqual(1);

      const tadpRequest: TADPRequest = await responseSpy.mock.results[0].value;
      expect(tadpRequest.typologyResult.review).toEqual(false);
      expect(tadpRequest.typologyResult.ruleResults).toContainEqual({ ...efrupResult, wght: 0 });
    });

    it('EFRuP - override, alertThreshold breached, not interdicting - review true', async () => {
      const Req = getMockReqPacs002();

      const networkMap: NetworkMap = getMockNetworkMapPacs002WithEFRuP();

      getTypologyConfigSpy = jest.spyOn(databaseManager, 'getTypologyConfig').mockImplementationOnce(async (_typology: Typology) => {
        return new Promise((resolve, _reject) =>
          resolve([
            [
              {
                cfg: '1.0.0',
                id: '030@1.0.0',
                workflow: {
                  alertThreshold: 125,
                  interdictionThreshold: 150,
                  flowProcessor: 'EFRuP@1.0.0',
                },
                rules: [
                  {
                    id: '003@1.0.0',
                    cfg: '1.0.0',
                    wghts: [
                      {
                        ref: '.01',
                        wght: 100,
                      },
                    ],
                    termId: 'v003at100at100',
                  },
                  {
                    id: 'EFRuP@1.0.0',
                    cfg: 'none',
                    wghts: [
                      {
                        ref: 'block',
                        wght: 0,
                      },
                      {
                        ref: 'override',
                        wght: 0,
                      },
                      {
                        ref: 'none',
                        wght: 0,
                      },
                    ],
                    termId: 'vEFRuPat100at100',
                  },
                ],
                expression: ['Add', 'v003at100at100'],
              },
            ],
          ]),
        );
      });

      // larger than or equal to 125 (alert) but not 150 (interdict)
      jest.spyOn(evaluation, 'evaluateTypologyExpression').mockReturnValueOnce(125);

      const ruleResult: RuleResult = {
        id: '003@1.0.0',
        cfg: '1.0.0',
        reason: 'reason',
        subRuleRef: '.01',
      };

      await handleTransaction({
        transaction: Req,
        networkMap,
        ruleResult,
      });

      expect(responseSpy).toHaveBeenCalledTimes(0);

      const efrupResult: RuleResult = {
        id: 'EFRuP@1.0.0',
        cfg: 'none',
        subRuleRef: 'override',
      };

      await handleTransaction({
        transaction: Req,
        networkMap,
        ruleResult: efrupResult,
      });

      expect(responseSpy).toHaveBeenCalledTimes(1);
      expect(responseSpy.mock.results.length).toEqual(1);

      const tadpRequest: TADPRequest = await responseSpy.mock.results[0].value;
      expect(tadpRequest.typologyResult.review).toEqual(true);
      expect(tadpRequest.typologyResult.ruleResults).toContainEqual(efrupResult); // evaluateTypologyExpression mock doesn't set wght's for ruleResults
    });

    it('EFRuP - override, interdicting - review true', async () => {
      const Req = getMockReqPacs002();

      const networkMap: NetworkMap = getMockNetworkMapPacs002WithEFRuP();

      getTypologyConfigSpy = jest.spyOn(databaseManager, 'getTypologyConfig').mockImplementationOnce(async (_typology: Typology) => {
        return new Promise((resolve, _reject) =>
          resolve([
            [
              {
                cfg: '1.0.0',
                id: '030@1.0.0',
                workflow: {
                  alertThreshold: 125,
                  interdictionThreshold: 150,
                  flowProcessor: 'EFRuP@1.0.0',
                },
                rules: [
                  {
                    id: '003@1.0.0',
                    cfg: '1.0.0',
                    wghts: [
                      {
                        ref: '.01',
                        wght: 100,
                      },
                    ],
                    termId: 'v003at100at100',
                  },
                  {
                    id: 'EFRuP@1.0.0',
                    cfg: 'none',
                    wghts: [
                      {
                        ref: 'block',
                        wght: 0,
                      },
                      {
                        ref: 'override',
                        wght: 0,
                      },
                      {
                        ref: 'none',
                        wght: 0,
                      },
                    ],
                    termId: 'vEFRuPat100at100',
                  },
                ],
                expression: ['Add', 'v003at100at100'],
              },
            ],
          ]),
        );
      });

      // larger than or equal to 150 (interdict)
      jest.spyOn(evaluation, 'evaluateTypologyExpression').mockReturnValueOnce(175);

      const ruleResult: RuleResult = {
        id: '003@1.0.0',
        cfg: '1.0.0',
        reason: 'reason',
        subRuleRef: '.01',
      };

      await handleTransaction({
        transaction: Req,
        networkMap,
        ruleResult,
      });

      expect(responseSpy).toHaveBeenCalledTimes(0);

      const efrupResult: RuleResult = {
        id: 'EFRuP@1.0.0',
        cfg: 'none',
        subRuleRef: 'override',
      };

      await handleTransaction({
        transaction: Req,
        networkMap,
        ruleResult: efrupResult,
      });

      expect(responseSpy).toHaveBeenCalledTimes(1); // -1 override blocks interdiction
      expect(responseSpy.mock.results.length).toEqual(1);

      const tadpRequest: TADPRequest = await responseSpy.mock.results[0].value;
      expect(tadpRequest.typologyResult.review).toEqual(true);
      expect(tadpRequest.typologyResult.ruleResults).toContainEqual(efrupResult); // evaluateTypologyExpression mock doesn't set wght's for ruleResults
    });

    it('EFRuP - none, interdicting - review true', async () => {
      const Req = getMockReqPacs002();

      const networkMap: NetworkMap = getMockNetworkMapPacs002WithEFRuP();

      getTypologyConfigSpy = jest.spyOn(databaseManager, 'getTypologyConfig').mockImplementationOnce(async (_typology: Typology) => {
        return new Promise((resolve, _reject) =>
          resolve([
            [
              {
                cfg: '1.0.0',
                id: '030@1.0.0',
                workflow: {
                  alertThreshold: 125,
                  interdictionThreshold: 150,
                  flowProcessor: 'EFRuP@1.0.0',
                },
                rules: [
                  {
                    id: '003@1.0.0',
                    cfg: '1.0.0',
                    wghts: [
                      {
                        ref: '.01',
                        wght: 100,
                      },
                    ],
                    termId: 'v003at100at100',
                  },
                  {
                    id: 'EFRuP@1.0.0',
                    cfg: 'none',
                    wghts: [
                      {
                        ref: 'block',
                        wght: 0,
                      },
                      {
                        ref: 'override',
                        wght: 0,
                      },
                      {
                        ref: 'none',
                        wght: 0,
                      },
                    ],
                    termId: 'vEFRuPat100at100',
                  },
                ],
                expression: ['Add', 'v003at100at100'],
              },
            ],
          ]),
        );
      });

      // larger than or equal to 150 (interdict)
      jest.spyOn(evaluation, 'evaluateTypologyExpression').mockReturnValueOnce(175);

      const ruleResult: RuleResult = {
        id: '003@1.0.0',
        cfg: '1.0.0',
        reason: 'reason',
        subRuleRef: '.01',
      };

      await handleTransaction({
        transaction: Req,
        networkMap,
        ruleResult,
      });

      expect(responseSpy).toHaveBeenCalledTimes(0);

      const efrupResult: RuleResult = {
        id: 'EFRuP@1.0.0',
        cfg: 'none',
        subRuleRef: 'none',
      };

      await handleTransaction({
        transaction: Req,
        networkMap,
        ruleResult: efrupResult,
      });

      expect(responseSpy).toHaveBeenCalledTimes(2); // +1 none doesn't block interdiction
      expect(responseSpy.mock.results.length).toEqual(2);

      const tadpRequest: TADPRequest = await responseSpy.mock.results[0].value;
      expect(tadpRequest.typologyResult.review).toEqual(true);
      expect(tadpRequest.typologyResult.ruleResults).toContainEqual(efrupResult); // evaluateTypologyExpression mock doesn't set wght's for ruleResults
    });
  });

  describe('EFRuP failures', () => {
    afterEach(() => {
      jest.spyOn(evaluation, 'evaluateTypologyExpression').mockRestore();
    });

    it('EFRuP - block, interdicting but missing from typology config workflow - block ignored', async () => {
      const Req = getMockReqPacs002();

      const networkMap: NetworkMap = getMockNetworkMapPacs002WithEFRuP();

      getTypologyConfigSpy = jest.spyOn(databaseManager, 'getTypologyConfig').mockImplementationOnce(async (_typology: Typology) => {
        return new Promise((resolve, _reject) =>
          resolve([
            [
              {
                cfg: '1.0.0',
                id: '030@1.0.0',
                workflow: {
                  alertThreshold: 125,
                  interdictionThreshold: 150,
                  // missing flowprocessor
                },
                rules: [
                  {
                    id: '003@1.0.0',
                    cfg: '1.0.0',
                    wghts: [
                      {
                        ref: '.01',
                        wght: 100,
                      },
                    ],
                    termId: 'v003at100at100',
                  },
                  {
                    id: 'EFRuP@1.0.0',
                    cfg: 'none',
                    wghts: [
                      {
                        ref: 'block',
                        wght: 0,
                      },
                      {
                        ref: 'override',
                        wght: 0,
                      },
                      {
                        ref: 'none',
                        wght: 0,
                      },
                    ],
                    termId: 'vEFRuPat100at100',
                  },
                ],
                expression: ['Add', 'v003at100at100'],
              },
            ],
          ]),
        );
      });

      // larger than or equal to 150 (interdict)
      jest.spyOn(evaluation, 'evaluateTypologyExpression').mockReturnValueOnce(175);

      const ruleResult: RuleResult = {
        id: '003@1.0.0',
        cfg: '1.0.0',
        reason: 'reason',
        subRuleRef: '.01',
      };

      await handleTransaction({
        transaction: Req,
        networkMap,
        ruleResult,
      });

      expect(responseSpy).toHaveBeenCalledTimes(0);

      const efrupResult: RuleResult = {
        id: 'EFRuP@1.0.0',
        cfg: 'none',
        subRuleRef: 'none',
      };

      await handleTransaction({
        transaction: Req,
        networkMap,
        ruleResult: efrupResult,
      });

      expect(responseSpy).toHaveBeenCalledTimes(2); // Block skipped workflow missing
      expect(responseSpy.mock.results.length).toEqual(2);

      const tadpRequest: TADPRequest = await responseSpy.mock.results[0].value;
      expect(tadpRequest.typologyResult.review).toEqual(true);
      expect(tadpRequest.typologyResult.ruleResults).toContainEqual(efrupResult); // evaluateTypologyExpression mock doesn't set wght's for ruleResults
    });
  });
});

describe('Typology Evaluation', () => {
  it('should handle simple expressions using "Add"', async () => {
    const ruleValues: IRuleValue[] = [
      {
        id: '003@1.0.0',
        cfg: '1.0.0',
        wghts: [
          {
            ref: '.01',
            wght: 100,
          },
        ],
        termId: 'v003at100at100',
      },
      {
        id: '004@1.0.0',
        cfg: '1.0.0',
        wghts: [
          {
            ref: '.01',
            wght: 50,
          },
        ],
        termId: 'v004at100at100',
      },
      {
        id: '005@1.0.0',
        cfg: '1.0.0',
        wghts: [
          {
            ref: '.01',
            wght: 25,
          },
        ],
        termId: 'v005at100at100',
      },
    ];

    const ruleResults = [
      {
        prcgTm: 0,
        id: '003@1.0.0',
        cfg: '1.0.0',
        reason: 'reason',
        subRuleRef: '.01',
      },
      {
        prcgTm: 0,
        id: '004@1.0.0',
        cfg: '1.0.0',
        reason: 'reason',
        subRuleRef: '.01',
      },
      {
        prcgTm: 0,
        id: '005@1.0.0',
        cfg: '1.0.0',
        reason: 'reason',
        subRuleRef: '.01',
      },
    ];

    const typologyExpression = {
      expression: ['Add', 'v003at100at100', 'v004at100at100', 'v005at100at100'],
    };

    const evaluation = evaluateTypologyExpression(ruleValues, ruleResults, typologyExpression.expression);
    expect(evaluation).toEqual(175);
  });

  it('should handle simple expressions using "Subtract"', async () => {
    const ruleValues: IRuleValue[] = [
      {
        id: '003@1.0.0',
        cfg: '1.0.0',
        wghts: [
          {
            ref: '.01',
            wght: 100,
          },
        ],
        termId: 'v003at100at100',
      },
      {
        id: '004@1.0.0',
        cfg: '1.0.0',
        wghts: [
          {
            ref: '.01',
            wght: 50,
          },
        ],
        termId: 'v004at100at100',
      },
      {
        id: '005@1.0.0',
        cfg: '1.0.0',
        wghts: [
          {
            ref: '.01',
            wght: 25,
          },
        ],
        termId: 'v005at100at100',
      },
    ];

    const ruleResults = [
      {
        prcgTm: 0,
        id: '003@1.0.0',
        cfg: '1.0.0',
        reason: 'reason',
        subRuleRef: '.01',
      },
      {
        prcgTm: 0,
        id: '004@1.0.0',
        cfg: '1.0.0',
        reason: 'reason',
        subRuleRef: '.01',
      },
      {
        prcgTm: 0,
        id: '005@1.0.0',
        cfg: '1.0.0',
        reason: 'reason',
        subRuleRef: '.01',
      },
    ];

    const typologyExpression = {
      expression: ['Subtract', 'v003at100at100', 'v005at100at100'],
    };

    const evaluation = evaluateTypologyExpression(ruleValues, ruleResults, typologyExpression.expression);
    expect(evaluation).toEqual(75);
  });

  it('should handle simple expressions using "Multiply"', async () => {
    const ruleValues: IRuleValue[] = [
      {
        id: '003@1.0.0',
        cfg: '1.0.0',
        wghts: [
          {
            ref: '.01',
            wght: 100,
          },
        ],
        termId: 'v003at100at100',
      },
      {
        id: '004@1.0.0',
        cfg: '1.0.0',
        wghts: [
          {
            ref: '.01',
            wght: 50,
          },
        ],
        termId: 'v004at100at100',
      },
      {
        id: '005@1.0.0',
        cfg: '1.0.0',
        wghts: [
          {
            ref: '.01',
            wght: 25,
          },
        ],
        termId: 'v005at100at100',
      },
    ];

    const ruleResults = [
      {
        prcgTm: 0,
        id: '003@1.0.0',
        cfg: '1.0.0',
        reason: 'reason',
        subRuleRef: '.01',
      },
      {
        prcgTm: 0,
        id: '004@1.0.0',
        cfg: '1.0.0',
        reason: 'reason',
        subRuleRef: '.01',
      },
      {
        prcgTm: 0,
        id: '005@1.0.0',
        cfg: '1.0.0',
        reason: 'reason',
        subRuleRef: '.01',
      },
    ];

    const typologyExpression = {
      expression: ['Multiply', 'v003at100at100', 'v004at100at100', 'v005at100at100'],
    };

    const evaluation = evaluateTypologyExpression(ruleValues, ruleResults, typologyExpression.expression);
    expect(evaluation).toEqual(125000);
  });

  it('should handle simple expressions using "Divide"', async () => {
    const ruleValues: IRuleValue[] = [
      {
        id: '003@1.0.0',
        cfg: '1.0.0',
        wghts: [
          {
            ref: '.01',
            wght: 100,
          },
        ],
        termId: 'v003at100at100',
      },
      {
        id: '004@1.0.0',
        cfg: '1.0.0',
        wghts: [
          {
            ref: '.01',
            wght: 50,
          },
        ],
        termId: 'v004at100at100',
      },
      {
        id: '005@1.0.0',
        cfg: '1.0.0',
        wghts: [
          {
            ref: '.01',
            wght: 25,
          },
        ],
        termId: 'v005at100at100',
      },
    ];

    const ruleResults = [
      {
        prcgTm: 0,
        id: '003@1.0.0',
        cfg: '1.0.0',
        reason: 'reason',
        subRuleRef: '.01',
      },
      {
        prcgTm: 0,
        id: '004@1.0.0',
        cfg: '1.0.0',
        reason: 'reason',
        subRuleRef: '.01',
      },
      {
        prcgTm: 0,
        id: '005@1.0.0',
        cfg: '1.0.0',
        reason: 'reason',
        subRuleRef: '.01',
      },
    ];

    const typologyExpression = {
      expression: ['Divide', 'v003at100at100', 'v005at100at100'],
    };

    const evaluation = evaluateTypologyExpression(ruleValues, ruleResults, typologyExpression.expression);
    expect(evaluation).toEqual(4);
  });

  it('should handle simple expressions with mixed rule refs', async () => {
    const ruleValues: IRuleValue[] = [
      {
        id: '003@1.0.0',
        cfg: '1.0.0',
        wghts: [
          {
            ref: '.01',
            wght: 100,
          },
          {
            ref: '.03',
            wght: 50,
          },
          {
            ref: '.err',
            wght: 0,
          },
        ],
        termId: 'v003at100at100',
      },
    ];

    const ruleResults = [
      {
        prcgTm: 0,
        id: '003@1.0.0',
        cfg: '1.0.0',
        reason: 'reason',
        subRuleRef: '.01',
      },
    ];

    const typologyExpression = {
      expression: [
        'Divide',
        [
          'Multiply',
          'v003at100at100',
          '2',
          [
            'Add',
            'v003at100at100',
            'v003at100at100',
            'v003at100at100',
            'v003at100at100',
            'v003at100at100',
            'v003at100at100',
            'v003at100at100',
            'v003at100at100',
          ],
        ],
        '160',
      ],
    };

    const evaluation = evaluateTypologyExpression(ruleValues, ruleResults, typologyExpression.expression);
    expect(evaluation).toEqual(1000);
  });

  it('should handle nested expressions using "Add"', async () => {
    const ruleValues: IRuleValue[] = [
      {
        id: '003@1.0.0',
        cfg: '1.0.0',
        wghts: [
          {
            ref: '.01',
            wght: 100,
          },
        ],
        termId: 'v003at100at100',
      },
      {
        id: '004@1.0.0',
        cfg: '1.0.0',
        wghts: [
          {
            ref: '.01',
            wght: 50,
          },
        ],
        termId: 'v004at100at100',
      },
      {
        id: '005@1.0.0',
        cfg: '1.0.0',
        wghts: [
          {
            ref: '.01',
            wght: 25,
          },
        ],
        termId: 'v005at100at100',
      },
    ];

    const ruleResults = [
      {
        prcgTm: 0,
        id: '003@1.0.0',
        cfg: '1.0.0',
        reason: 'reason',
        subRuleRef: '.01',
      },
      {
        prcgTm: 0,
        id: '004@1.0.0',
        cfg: '1.0.0',
        reason: 'reason',
        subRuleRef: '.01',
      },
      {
        prcgTm: 0,
        id: '005@1.0.0',
        cfg: '1.0.0',
        reason: 'reason',
        subRuleRef: '.01',
      },
    ];

    const typologyExpression = {
      expression: [
        'Add',
        ['Add', 'v003at100at100', 'v004at100at100', 'v005at100at100'],
        'v003at100at100',
        'v004at100at100',
        'v005at100at100',
      ],
    };

    const evaluation = evaluateTypologyExpression(ruleValues, ruleResults, typologyExpression.expression);
    expect(evaluation).toEqual(350);
  });

  it('should handle nested expressions using "Subtract"', async () => {
    const ruleValues: IRuleValue[] = [
      {
        id: '003@1.0.0',
        cfg: '1.0.0',
        wghts: [
          {
            ref: '.01',
            wght: 100,
          },
        ],
        termId: 'v003at100at100',
      },
      {
        id: '004@1.0.0',
        cfg: '1.0.0',
        wghts: [
          {
            ref: '.01',
            wght: 50,
          },
        ],
        termId: 'v004at100at100',
      },
      {
        id: '005@1.0.0',
        cfg: '1.0.0',
        wghts: [
          {
            ref: '.01',
            wght: 25,
          },
        ],
        termId: 'v005at100at100',
      },
    ];

    const ruleResults = [
      {
        prcgTm: 0,
        id: '003@1.0.0',
        cfg: '1.0.0',
        reason: 'reason',
        subRuleRef: '.01',
      },
      {
        prcgTm: 0,
        id: '004@1.0.0',
        cfg: '1.0.0',
        reason: 'reason',
        subRuleRef: '.01',
      },
      {
        prcgTm: 0,
        id: '005@1.0.0',
        cfg: '1.0.0',
        reason: 'reason',
        subRuleRef: '.01',
      },
    ];

    const typologyExpression = {
      expression: ['Subtract', ['Subtract', 'v003at100at100', 'v004at100at100'], 'v005at100at100'],
    };

    const evaluation = evaluateTypologyExpression(ruleValues, ruleResults, typologyExpression.expression);
    expect(evaluation).toEqual(25);
  });

  it('should handle nested expressions using "Multiply"', async () => {
    const ruleValues: IRuleValue[] = [
      {
        id: '003@1.0.0',
        cfg: '1.0.0',
        wghts: [
          {
            ref: '.01',
            wght: 100,
          },
        ],
        termId: 'v003at100at100',
      },
      {
        id: '004@1.0.0',
        cfg: '1.0.0',
        wghts: [
          {
            ref: '.01',
            wght: 50,
          },
        ],
        termId: 'v004at100at100',
      },
      {
        id: '005@1.0.0',
        cfg: '1.0.0',
        wghts: [
          {
            ref: '.01',
            wght: 25,
          },
        ],
        termId: 'v005at100at100',
      },
    ];

    const ruleResults = [
      {
        prcgTm: 0,
        id: '003@1.0.0',
        cfg: '1.0.0',
        reason: 'reason',
        subRuleRef: '.01',
      },
      {
        prcgTm: 0,
        id: '004@1.0.0',
        cfg: '1.0.0',
        reason: 'reason',
        subRuleRef: '.01',
      },
      {
        prcgTm: 0,
        id: '005@1.0.0',
        cfg: '1.0.0',
        reason: 'reason',
        subRuleRef: '.01',
      },
    ];

    const typologyExpression = {
      expression: ['Multiply', 'v003at100at100', ['Multiply', 'v004at100at100', 'v005at100at100']],
    };

    const evaluation = evaluateTypologyExpression(ruleValues, ruleResults, typologyExpression.expression);
    expect(evaluation).toEqual(125000);
  });

  it('should handle nested expressions using "Divide"', async () => {
    const ruleValues: IRuleValue[] = [
      {
        id: '003@1.0.0',
        cfg: '1.0.0',
        wghts: [
          {
            ref: '.01',
            wght: 100,
          },
        ],
        termId: 'v003at100at100',
      },
      {
        id: '004@1.0.0',
        cfg: '1.0.0',
        wghts: [
          {
            ref: '.01',
            wght: 50,
          },
        ],
        termId: 'v004at100at100',
      },
      {
        id: '005@1.0.0',
        cfg: '1.0.0',
        wghts: [
          {
            ref: '.01',
            wght: 25,
          },
        ],
        termId: 'v005at100at100',
      },
    ];

    const ruleResults = [
      {
        prcgTm: 0,
        id: '003@1.0.0',
        cfg: '1.0.0',
        reason: 'reason',
        subRuleRef: '.01',
      },
      {
        prcgTm: 0,
        id: '004@1.0.0',
        cfg: '1.0.0',
        reason: 'reason',
        subRuleRef: '.01',
      },
      {
        prcgTm: 0,
        id: '005@1.0.0',
        cfg: '1.0.0',
        reason: 'reason',
        subRuleRef: '.01',
      },
    ];

    const typologyExpression = {
      expression: ['Divide', 'v003at100at100', ['Divide', 'v004at100at100', 'v005at100at100']],
    };

    const evaluation = evaluateTypologyExpression(ruleValues, ruleResults, typologyExpression.expression);
    expect(evaluation).toEqual(50);
  });

  it('should handle complex nested expressions', async () => {
    const ruleValues: IRuleValue[] = [
      {
        id: '003@1.0.0',
        cfg: '1.0.0',
        wghts: [
          {
            ref: '.01',
            wght: 100,
          },
        ],
        termId: 'v003at100at100',
      },
      {
        id: '004@1.0.0',
        cfg: '1.0.0',
        wghts: [
          {
            ref: '.01',
            wght: 50,
          },
        ],
        termId: 'v004at100at100',
      },
      {
        id: '005@1.0.0',
        cfg: '1.0.0',
        wghts: [
          {
            ref: '.01',
            wght: 25,
          },
        ],
        termId: 'v005at100at100',
      },
    ];

    const ruleResults = [
      {
        prcgTm: 0,
        id: '003@1.0.0',
        cfg: '1.0.0',
        reason: 'reason',
        subRuleRef: '.01',
      },
      {
        prcgTm: 0,
        id: '004@1.0.0',
        cfg: '1.0.0',
        reason: 'reason',
        subRuleRef: '.01',
      },
      {
        prcgTm: 0,
        id: '005@1.0.0',
        cfg: '1.0.0',
        reason: 'reason',
        subRuleRef: '.01',
      },
    ];

    const typologyExpression = {
      expression: [
        'Add',
        ['Add', 'v003at100at100', 'v004at100at100'],
        ['Subtract', 'v003at100at100'],
        'v003at100at100',
        ['Multiply', 'v004at100at100', ['Divide', 'v004at100at100', 'v005at100at100']],
      ],
    };

    // (100 + 50) + (-100) + 100 + (50 x (50/2))
    // 150 - 100 + 100 + 100
    // = 250

    const evaluation = evaluateTypologyExpression(ruleValues, ruleResults, typologyExpression.expression);
    expect(evaluation).toEqual(250);
  });

  it('should handle a mixture of constants', async () => {
    const ruleValues: IRuleValue[] = [
      {
        id: '003@1.0.0',
        cfg: '1.0.0',
        wghts: [
          {
            ref: '.01',
            wght: 100,
          },
        ],
        termId: 'v003at100at100',
      },
      {
        id: '004@1.0.0',
        cfg: '1.0.0',
        wghts: [
          {
            ref: '.01',
            wght: 50,
          },
        ],
        termId: 'v004at100at100',
      },
      {
        id: '005@1.0.0',
        cfg: '1.0.0',
        wghts: [
          {
            ref: '.01',
            wght: 25,
          },
        ],
        termId: 'v005at100at100',
      },
    ];

    const ruleResults = [
      {
        prcgTm: 0,
        id: '003@1.0.0',
        cfg: '1.0.0',
        reason: 'reason',
        subRuleRef: '.01',
      },
      {
        prcgTm: 0,
        id: '004@1.0.0',
        cfg: '1.0.0',
        reason: 'reason',
        subRuleRef: '.01',
      },
      {
        prcgTm: 0,
        id: '005@1.0.0',
        cfg: '1.0.0',
        reason: 'reason',
        subRuleRef: '.01',
      },
    ];

    const typologyExpression = {
      expression: ['Add', 'v003at100at100', 'v004at100at100', 'v005at100at100', '625'],
    };

    const evaluation = evaluateTypologyExpression(ruleValues, ruleResults, typologyExpression.expression);
    expect(evaluation).toEqual(800);
  });

  it('should fail on bad or missing termId - null', async () => {
    const ruleValues: IRuleValue[] = [
      {
        id: '003@1.0.0',
        cfg: '1.0.0',
        wghts: [
          {
            ref: '.01',
            wght: 100,
          },
        ],
        termId: 'v003at100at100',
      },
      {
        id: '004@1.0.0',
        cfg: '1.0.0',
        wghts: [
          {
            ref: '.01',
            wght: 50,
          },
        ],
        termId: 'v004at100at100',
      },
      {
        id: '005@1.0.0',
        cfg: '1.0.0',
        wghts: [
          {
            ref: '.01',
            wght: 25,
          },
        ],
        termId: 'v005at100at100',
      },
    ];

    const ruleResults = [
      {
        prcgTm: 0,
        id: '003@1.0.0',
        cfg: '1.0.0',
        reason: 'reason',
        subRuleRef: '.01',
      },
      {
        prcgTm: 0,
        id: '004@1.0.0',
        cfg: '1.0.0',
        reason: 'reason',
        subRuleRef: '.01',
      },
      {
        prcgTm: 0,
        id: '005@1.0.0',
        cfg: '1.0.0',
        reason: 'reason',
        subRuleRef: '.01',
      },
    ];

    const typologyExpression = {
      expression: [
        'Add',
        ['Add', 'v003at100at100', 'v004at100at100'],
        ['Subtract', 'v003at100at100'],
        'v003at100at100',
        'v004at100at100',
        'v005at100at100Z', //bad termId
      ],
    };

    const evaluation = evaluateTypologyExpression(ruleValues, ruleResults, typologyExpression.expression);
    expect(evaluation).toEqual(0);
  });

  it('should fail on incorrect number of arguments for "Subtract" and "Divide"', async () => {
    const ruleValues: IRuleValue[] = [
      {
        id: '003@1.0.0',
        cfg: '1.0.0',
        wghts: [
          {
            ref: '.01',
            wght: 100,
          },
        ],
        termId: 'v003at100at100',
      },
      {
        id: '004@1.0.0',
        cfg: '1.0.0',
        wghts: [
          {
            ref: '.01',
            wght: 50,
          },
        ],
        termId: 'v004at100at100',
      },
      {
        id: '005@1.0.0',
        cfg: '1.0.0',
        wghts: [
          {
            ref: '.01',
            wght: 25,
          },
        ],
        termId: 'v005at100at100',
      },
    ];

    const ruleResults = [
      {
        prcgTm: 0,
        id: '003@1.0.0',
        cfg: '1.0.0',
        reason: 'reason',
        subRuleRef: '.01',
      },
      {
        prcgTm: 0,
        id: '004@1.0.0',
        cfg: '1.0.0',
        reason: 'reason',
        subRuleRef: '.01',
      },
      {
        prcgTm: 0,
        id: '005@1.0.0',
        cfg: '1.0.0',
        reason: 'reason',
        subRuleRef: '.01',
      },
    ];

    const subtractExpression = {
      expression: ['Subtract', 'v003at100at100', 'v004at100at100', 'v005at100at100', 'v005at100at100'],
    };

    const evaluation1 = evaluateTypologyExpression(ruleValues, ruleResults, subtractExpression.expression);
    // This is will change on @cortex-js/compute-engine v0.25.1 and newer
    expect(evaluation1).toEqual(0);

    const divideExpression = {
      expression: ['Divide', 'v003at100at100', 'v004at100at100', 'v005at100at100'],
    };

    const evaluation2 = evaluateTypologyExpression(ruleValues, ruleResults, divideExpression.expression);
    // This is will change on @cortex-js/compute-engine v0.25.1 and newer
    expect(evaluation2).toEqual(0);
  });

  it('should handle simplify fractions', async () => {
    const ruleValues: IRuleValue[] = [
      {
        id: '003@1.0.0',
        cfg: '1.0.0',
        wghts: [
          {
            ref: '.01',
            wght: 100,
          },
        ],
        termId: 'v003at100at100',
      },
      {
        id: '004@1.0.0',
        cfg: '1.0.0',
        wghts: [
          {
            ref: '.01',
            wght: 200,
          },
        ],
        termId: 'v004at100at100',
      },
      {
        id: '005@1.0.0',
        cfg: '1.0.0',
        wghts: [
          {
            ref: '.01',
            wght: 25,
          },
        ],
        termId: 'v005at100at100',
      },
    ];

    const ruleResults = [
      {
        prcgTm: 0,
        id: '003@1.0.0',
        cfg: '1.0.0',
        reason: 'reason',
        subRuleRef: '.01',
      },
      {
        prcgTm: 0,
        id: '004@1.0.0',
        cfg: '1.0.0',
        reason: 'reason',
        subRuleRef: '.01',
      },
      {
        prcgTm: 0,
        id: '005@1.0.0',
        cfg: '1.0.0',
        reason: 'reason',
        subRuleRef: '.01',
      },
    ];

    const typologyExpression = {
      expression: ['Divide', 'v003at100at100', 'v004at100at100'],
    };

    const evaluation = evaluateTypologyExpression(ruleValues, ruleResults, typologyExpression.expression);
    expect(evaluation).toEqual(0.5);
  });
});
