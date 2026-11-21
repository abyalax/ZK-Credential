pragma circom 2.1.6;

include "../templates/holder.circom";

// Public signals: [issuerKeyHash, gpaThreshold] (outputs come first), same as the issuer variant.
component main {public [gpaThreshold]} = HolderCredential(9, 400);
