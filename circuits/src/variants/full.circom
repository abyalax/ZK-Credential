pragma circom 2.1.6;

include "../templates/full.circom";

// Variant "full": issuer + holder + replay binding (the proposed model).
// Public signals: [issuerKeyHash, gpaThreshold, challenge, verifierId] (outputs come first).
component main {public [gpaThreshold, challenge, verifierId]} = FullCredential(9, 400);
