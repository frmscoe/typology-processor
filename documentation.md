# Typology Processor

## Overview

Here's a brief explanation of each participant:

- Caller: The caller initiates the request to process a transaction.
- Handle Transaction: This function handles the transaction, coordinates the processing steps, and accumulates the results.
- Execute Request: This function processes the transaction for each typology and sends the results to CMS and CADP.
- Evaluate Typology Expr: This function computes the typology result value based on the provided expression.
- Redis Cache: Redis Cache stores interim rule results for faster processing and manages cache keys.
- Database: The Database provides the typology expression needed for evaluation.
- CMS: The CMS receives typology results that exceed the threshold.
- CADP: The CADP receives all the typology results.

## Sequence Diagram

```mermaid
sequenceDiagram
    autonumber
    participant Caller as Caller
    participant HandleTransaction as Handle Transaction
    participant ExecuteRequest as Execute Request
    participant EvaluateTypologyExpr as Evaluate Typology Expr
    participant RedisCache as Redis Cache
    participant Database as Database
    participant CMS as CMS
    participant CADP as CADP

    Note over Caller, HandleTransaction: The process starts by handling a transaction.

    Caller->>HandleTransaction: call(transaction, networkMap, ruleResult)
    HandleTransaction->>+ExecuteRequest: call(transaction, typology, ruleResult, networkMap)

    Note over ExecuteRequest: Execute Request processes the transaction for each typology.

    loop channel.typologies
        ExecuteRequest->>RedisCache: addOneGetAll(cacheKey, ruleResult)
        ExecuteRequest->>RedisCache: check cached ruleResults

        Note over RedisCache: Redis Cache stores interim rule results for faster processing.

        opt no cached ruleResults
            ExecuteRequest->>HandleTransaction: return CADPRequest
        end
        ExecuteRequest->>Database: getTypologyExpression(typology)

        Note over Database: Database provides the typology expression needed for evaluation.

        ExecuteRequest->>EvaluateTypologyExpr: call(ruleValues, ruleResults, typologyExpression)

        Note over EvaluateTypologyExpr: Evaluate Typology Expr computes the typology result value.

        opt typologyResultValue > expression.threshold
            ExecuteRequest->>CMS: send Typology result
        end

        Note over CMS: CMS receives typology results that exceed the threshold.

        ExecuteRequest->>CADP: send Typology result

        Note over CADP: CADP receives all the typology results.

        ExecuteRequest->>RedisCache: deleteKey(cacheKey)

        Note over RedisCache: Redis Cache deletes the interim cache key after processing.

        ExecuteRequest->>HandleTransaction: return CADPRequest
    end

    HandleTransaction-->>ExecuteRequest: CADPRequest returned
    HandleTransaction->>HandleTransaction: add CADPRequest to CombinedResult.cadpRequests

    Note over HandleTransaction: Handle Transaction accumulates the CADPRequests.

    HandleTransaction->>Caller: return CombinedResult

    Note over Caller: The final combined result is returned to the caller.


```

Here's a detailed explanation of the numbers in the sequence diagram:

1. The process starts by handling a transaction. The caller initiates the request to process a transaction by calling the HandleTransaction function with the transaction, network map, and rule result as input parameters.
2. The HandleTransaction function, in turn, calls the ExecuteRequest function for each typology in the transaction. It passes the transaction, typology, rule result, and network map as input parameters.
3. The ExecuteRequest function processes the transaction for each typology. It interacts with Redis Cache to store and retrieve interim rule results for faster processing.
4. If there are no cached rule results, the ExecuteRequest function returns a CADPRequest to the HandleTransaction function.
5. The ExecuteRequest function retrieves the typology expression from the database.
6. The ExecuteRequest function calls the EvaluateTypologyExpr function to compute the typology result value based on the provided expression, rule values, and rule results.
7. If the computed typology result value is greater than the threshold, the ExecuteRequest function sends the typology result to the CMS.
8. The ExecuteRequest function sends all the typology results to the CADP.
9. After processing, the ExecuteRequest function deletes the interim cache key from Redis Cache.
10. The ExecuteRequest function returns a CADPRequest to the HandleTransaction function.
11. The HandleTransaction function accumulates the CADPRequests in a combined result.
12. Finally, the HandleTransaction function returns the combined result to the caller.
