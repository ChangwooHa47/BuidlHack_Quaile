pragma circom 2.1.0;

// MAX_CRITERIA개의 bool 입력이 전부 1(pass)인지 검증하는 circuit.
// criteria_count 이하의 인덱스만 검사하고, 나머지는 무시(1로 패딩 전제).
//
// Public inputs:  payload_hash (4 x 64-bit limbs로 분해한 keccak256)
// Private inputs: criteria[MAX_CRITERIA], criteria_count
//
// 핵심 제약: criteria[0..criteria_count-1]이 전부 1이면 eligible=1

template Eligibility(MAX_CRITERIA) {
    // --- public inputs ---
    signal input payload_hash_limbs[4];

    // --- private inputs ---
    signal input criteria[MAX_CRITERIA];
    signal input criteria_count;

    // --- output ---
    signal output eligible;

    // 1) criteria는 반드시 0 또는 1
    for (var i = 0; i < MAX_CRITERIA; i++) {
        criteria[i] * (1 - criteria[i]) === 0;
    }

    // 2) Declare all intermediate signals upfront (circom requires this)
    signal diff[MAX_CRITERIA];
    signal mask[MAX_CRITERIA];
    signal effective[MAX_CRITERIA];
    signal running_product[MAX_CRITERIA + 1];
    component lt_check[MAX_CRITERIA];

    running_product[0] <== 1;

    // 3) active criteria가 전부 pass인지 확인
    for (var i = 0; i < MAX_CRITERIA; i++) {
        diff[i] <== criteria_count - i;

        lt_check[i] = GreaterThan(8);
        lt_check[i].in[0] <== diff[i];
        lt_check[i].in[1] <== 0;
        mask[i] <== lt_check[i].out;

        // effective[i] = mask[i] ? criteria[i] : 1
        //              = 1 + mask[i] * (criteria[i] - 1)
        effective[i] <== 1 + mask[i] * (criteria[i] - 1);

        running_product[i + 1] <== running_product[i] * effective[i];
    }

    eligible <== running_product[MAX_CRITERIA];
}

// --- Comparator templates (from circomlib) ---

template GreaterThan(n) {
    signal input in[2];
    signal output out;

    component lt = LessThan(n);
    lt.in[0] <== in[1];
    lt.in[1] <== in[0];
    out <== lt.out;
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
