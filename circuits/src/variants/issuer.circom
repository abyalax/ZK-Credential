pragma circom 2.1.6;

include "issuer.circom";

// Public signals: [gpaThreshold, issuerKeyHash].
component main {public [gpaThreshold]} = IssuerCredential(9, 400);
