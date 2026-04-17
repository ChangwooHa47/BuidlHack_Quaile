pragma circom 2.1.0;

// Proves that the number of passing criteria in the active window reaches
// the foundation-declared threshold, without revealing which ones.
//
// MAX_CRITERIA = 10 (fixed by circuit; padded with 1s beyond criteria_count).
// Public inputs:
//   payload_hash_limbs[4]  — 4 x 64-bit big-endian limbs of keccak256(payload)
// Private inputs:
//   criteria[MAX_CRITERIA] — per-criterion pass/fail as 0/1
//   criteria_count         — number of active entries (others are padding)
//   threshold              — minimum passes required; expected to match the
//                            `[THRESHOLD:N]` marker in policy.natural_language.
//                            When the policy omits the marker, the TEE sets
//                            threshold == criteria_count (= all must pass),
//                            which reproduces the legacy "all-AND" semantics.
// Output:
//   eligible               — 1 iff sum(criteria[i] for i < criteria_count) >= threshold

template Eligibility(MAX_CRITERIA) {
    // --- public ---
    signal input payload_hash_limbs[4];

    // --- private ---
    signal input criteria[MAX_CRITERIA];
    signal input criteria_count;
    signal input threshold;

    // --- output ---
    signal output eligible;

    // 1) Each criterion is strictly 0 or 1.
    for (var i = 0; i < MAX_CRITERIA; i++) {
        criteria[i] * (1 - criteria[i]) === 0;
    }

    // 2) Mask out padding: only criteria[i] with i < criteria_count contribute
    //    to the pass count. The mask is derived from (criteria_count - i) > 0.
    signal diff[MAX_CRITERIA];
    signal mask[MAX_CRITERIA];
    signal effective[MAX_CRITERIA];
    component lt_check[MAX_CRITERIA];

    for (var i = 0; i < MAX_CRITERIA; i++) {
        diff[i] <== criteria_count - i;

        lt_check[i] = GreaterThan(8);
        lt_check[i].in[0] <== diff[i];
        lt_check[i].in[1] <== 0;
        mask[i] <== lt_check[i].out;

        // effective[i] = mask[i] ? criteria[i] : 0
        effective[i] <== mask[i] * criteria[i];
    }

    // 3) pass_count = sum(effective[i]).
    //    Unroll into fixed-size accumulator signals so circom doesn't need
    //    dynamic array indexing.
    signal running_sum[MAX_CRITERIA + 1];
    running_sum[0] <== 0;
    for (var i = 0; i < MAX_CRITERIA; i++) {
        running_sum[i + 1] <== running_sum[i] + effective[i];
    }

    signal pass_count;
    pass_count <== running_sum[MAX_CRITERIA];

    // 4) eligible = (pass_count >= threshold).
    //    Comparator width 8 fits MAX_CRITERIA=10 and any reasonable threshold.
    component ge = GreaterEqThan(8);
    ge.in[0] <== pass_count;
    ge.in[1] <== threshold;
    eligible <== ge.out;
}

// --- Comparator templates (from circomlib, inlined for zero deps) ---

template GreaterThan(n) {
    signal input in[2];
    signal output out;

    component lt = LessThan(n);
    lt.in[0] <== in[1];
    lt.in[1] <== in[0];
    out <== lt.out;
}

template GreaterEqThan(n) {
    signal input in[2];
    signal output out;

    // a >= b  <=>  NOT (a < b)
    component lt = LessThan(n);
    lt.in[0] <== in[0];
    lt.in[1] <== in[1];
    out <== 1 - lt.out;
}

template LessThan(n) {
    assert(n <= 252);
    signal input in[2];
    signal output out;

    component n2b = Num2Bits(n + 1);
    n2b.in <== in[0] + (1 << n) - in[1];
    out <== 1 - n2b.out[n];
}

template Num2Bits(n) {
    signal input in;
    signal output out[n];
    var lc1 = 0;

    var e2 = 1;
    for (var i = 0; i < n; i++) {
        out[i] <-- (in >> i) & 1;
        out[i] * (out[i] - 1) === 0;
        lc1 += out[i] * e2;
        e2 = e2 + e2;
    }
    lc1 === in;
}

component main {public [payload_hash_limbs]} = Eligibility(10);
