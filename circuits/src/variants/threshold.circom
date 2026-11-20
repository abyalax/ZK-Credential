pragma circom 2.1.6;

include "../templates/gpa_threshold.circom";

// Variant "threshold": GPA threshold only, no issuer, holder or challenge binding.
// This is the "ZKP without the full set of security mechanisms" baseline of the ablation study.
// Public signals: [gpaThreshold]
component main {public [gpaThreshold]} = GpaThreshold(9, 400);
