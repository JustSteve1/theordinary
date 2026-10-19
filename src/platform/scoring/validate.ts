export type KappaReport = {
  quadraticWeighted: number | null;
  factHit: number | null;
  sample: number;
  meetsDimension: boolean;
  meetsFact: boolean;
  reason: string | null;
};

export function calibrationReport(input: {
  dimensionA: number[];
  dimensionB: number[];
  factA: number[];
  factB: number[];
  targets: { dimensionKappa: number; factKappa: number; handLabelSample: number };
}): KappaReport {
  const sample = input.dimensionA.length;
  if (sample < input.targets.handLabelSample) {
    return {
      quadraticWeighted: sample ? quadraticWeightedKappa(input.dimensionA, input.dimensionB) : null,
      factHit: sample ? cohensKappa(input.factA, input.factB) : null,
      sample,
      meetsDimension: false,
      meetsFact: false,
      reason: `Hand-label sample is ${sample} of ${input.targets.handLabelSample}. Targets are not met.`,
    };
  }
  const quadraticWeighted = quadraticWeightedKappa(input.dimensionA, input.dimensionB);
  const factHit = cohensKappa(input.factA, input.factB);
  const meetsDimension = quadraticWeighted >= input.targets.dimensionKappa;
  const meetsFact = factHit >= input.targets.factKappa;
  return {
    quadraticWeighted,
    factHit,
    sample,
    meetsDimension,
    meetsFact,
    reason: meetsDimension && meetsFact ? null : "A reliability target was missed.",
  };
}

export function quadraticWeightedKappa(left: number[], right: number[], classes = [0, 1, 2, 3]) {
  if (left.length === 0 || left.length !== right.length) {
    return 0;
  }
  const index = new Map(classes.map((value, position) => [value, position]));
  const size = classes.length;
  const observed = Array.from({ length: size }, () => Array.from({ length: size }, () => 0));
  for (let row = 0; row < left.length; row += 1) {
    const i = index.get(left[row] ?? 0) ?? 0;
    const j = index.get(right[row] ?? 0) ?? 0;
    const bucket = observed[i];
    if (bucket) {
      bucket[j] = (bucket[j] ?? 0) + 1;
    }
  }
  const n = left.length;
  const rowSums = observed.map((row) => row.reduce((sum, value) => sum + value, 0));
  const colSums = classes.map((_, column) =>
    observed.reduce((sum, row) => sum + (row[column] ?? 0), 0),
  );
  let observedWeight = 0;
  let expectedWeight = 0;
  const denom = (size - 1) ** 2 || 1;
  for (let i = 0; i < size; i += 1) {
    for (let j = 0; j < size; j += 1) {
      const weight = ((i - j) ** 2) / denom;
      observedWeight += weight * ((observed[i]?.[j] ?? 0) / n);
      expectedWeight += weight * (((rowSums[i] ?? 0) / n) * ((colSums[j] ?? 0) / n));
    }
  }
  if (expectedWeight === 0) {
    return 1;
  }
  return 1 - observedWeight / expectedWeight;
}

export function cohensKappa(left: number[], right: number[]) {
  if (left.length === 0 || left.length !== right.length) {
    return 0;
  }
  let agree = 0;
  let leftPos = 0;
  let rightPos = 0;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] === right[index]) {
      agree += 1;
    }
    if (left[index] === 1) {
      leftPos += 1;
    }
    if (right[index] === 1) {
      rightPos += 1;
    }
  }
  const n = left.length;
  const p0 = agree / n;
  const pLeft = leftPos / n;
  const pRight = rightPos / n;
  const pE = pLeft * pRight + (1 - pLeft) * (1 - pRight);
  if (pE === 1) {
    return 1;
  }
  return (p0 - pE) / (1 - pE);
}

export function spearmanBrown(correlation: number, parts: number) {
  if (parts <= 1) {
    return correlation;
  }
  return (parts * correlation) / (1 + (parts - 1) * correlation);
}

/** ICC(2,1): two-way random, single measurement. Rows are members, columns are repeats. */
export function icc21(matrix: number[][]) {
  const n = matrix.length;
  const k = matrix[0]?.length ?? 0;
  if (n < 2 || k < 2) {
    return 0;
  }
  let grand = 0;
  for (const row of matrix) {
    for (const value of row) {
      grand += value;
    }
  }
  grand /= n * k;
  const rowMeans = matrix.map((row) => row.reduce((sum, value) => sum + value, 0) / k);
  const colMeans = Array.from({ length: k }, (_, column) => {
    return matrix.reduce((sum, row) => sum + (row[column] ?? 0), 0) / n;
  });
  const msr =
    (k * rowMeans.reduce((sum, mean) => sum + (mean - grand) ** 2, 0)) / (n - 1);
  const msc =
    (n * colMeans.reduce((sum, mean) => sum + (mean - grand) ** 2, 0)) / (k - 1);
  let sse = 0;
  for (let row = 0; row < n; row += 1) {
    for (let column = 0; column < k; column += 1) {
      const value = matrix[row]?.[column] ?? 0;
      const expected = (rowMeans[row] ?? 0) + (colMeans[column] ?? 0) - grand;
      sse += (value - expected) ** 2;
    }
  }
  const mse = sse / ((n - 1) * (k - 1));
  const denominator = msr + (k - 1) * mse + (k * (msc - mse)) / n;
  if (denominator === 0) {
    return 1;
  }
  return (msr - mse) / denominator;
}

export function firstFactorShare(columns: number[][]) {
  const n = columns[0]?.length ?? 0;
  const k = columns.length;
  if (n < 3 || k < 2) {
    return 0;
  }
  const corr = correlation(columns);
  const values = eigenvalues(corr);
  const total = values.reduce((sum, value) => sum + Math.max(0, value), 0);
  return total === 0 ? 0 : Math.max(...values) / total;
}

export type WeightProposal = {
  published: boolean;
  scorerVersion: "2.0.0" | "3.0.0";
  reason: string;
  dimensionWeights: number[] | null;
};

/**
 * Phase 3 gate. Hand-set v2 weights stay in the config until a real study
 * clears every target. This function never writes the config.
 */
export function proposeWeights(input: {
  members: number;
  checkinsPerMember: number;
  dimensionLevels: number[][];
  report: KappaReport;
  retestIcc: number;
  splitHalf: number;
  targets: KappaReport extends never
    ? never
    : {
        dimensionKappa: number;
        factKappa: number;
        splitHalf: number;
        icc: number;
        handLabelSample: number;
      };
}): WeightProposal {
  if (input.members < 200 || input.checkinsPerMember < 10) {
    return {
      published: false,
      scorerVersion: "2.0.0",
      reason: "Need 200 members with 10 check-ins each before weights can change.",
      dimensionWeights: null,
    };
  }
  if (!input.report.meetsDimension || !input.report.meetsFact) {
    return {
      published: false,
      scorerVersion: "2.0.0",
      reason: input.report.reason ?? "Reliability targets were missed.",
      dimensionWeights: null,
    };
  }
  if (input.retestIcc < input.targets.icc || input.splitHalf < input.targets.splitHalf) {
    return {
      published: false,
      scorerVersion: "2.0.0",
      reason: "Retest or split-half reliability is below the target.",
      dimensionWeights: null,
    };
  }
  const share = firstFactorShare(input.dimensionLevels);
  if (share < 0.6) {
    return {
      published: false,
      scorerVersion: "2.0.0",
      reason: "More than one factor. Keep the equal dimension mean.",
      dimensionWeights: null,
    };
  }
  const loadings = Math.sqrt(share);
  const weights = input.dimensionLevels.map(() => loadings);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  return {
    published: true,
    scorerVersion: "3.0.0",
    reason: "One-factor solution cleared the reliability targets.",
    dimensionWeights: weights.map((weight) => weight / total),
  };
}

function correlation(columns: number[][]) {
  const means = columns.map(mean);
  const size = columns.length;
  const matrix = Array.from({ length: size }, () => Array.from({ length: size }, () => 0));
  for (let i = 0; i < size; i += 1) {
    for (let j = 0; j < size; j += 1) {
      const left = columns[i] ?? [];
      const right = columns[j] ?? [];
      let cov = 0;
      let leftVar = 0;
      let rightVar = 0;
      for (let row = 0; row < left.length; row += 1) {
        const a = (left[row] ?? 0) - (means[i] ?? 0);
        const b = (right[row] ?? 0) - (means[j] ?? 0);
        cov += a * b;
        leftVar += a * a;
        rightVar += b * b;
      }
      const denom = Math.sqrt(leftVar * rightVar);
      const cell = matrix[i];
      if (cell) {
        cell[j] = denom === 0 ? (i === j ? 1 : 0) : cov / denom;
      }
    }
  }
  return matrix;
}

function mean(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function eigenvalues(matrix: number[][]) {
  const size = matrix.length;
  const a = matrix.map((row) => [...row]);
  const values: number[] = [];
  for (let found = 0; found < size; found += 1) {
    let vector = Array.from({ length: size }, () => 1 / size);
    let value = 0;
    for (let step = 0; step < 48; step += 1) {
      const next = multiply(a, vector);
      const norm = Math.hypot(...next) || 1;
      vector = next.map((item) => item / norm);
      value = rayleigh(a, vector);
    }
    values.push(value);
    for (let row = 0; row < size; row += 1) {
      for (let column = 0; column < size; column += 1) {
        const current = a[row];
        if (current) {
          current[column] = (current[column] ?? 0) - value * (vector[row] ?? 0) * (vector[column] ?? 0);
        }
      }
    }
  }
  return values;
}

function multiply(matrix: number[][], vector: number[]) {
  return matrix.map((row) => row.reduce((sum, value, index) => sum + value * (vector[index] ?? 0), 0));
}

function rayleigh(matrix: number[][], vector: number[]) {
  const product = multiply(matrix, vector);
  const top = product.reduce((sum, value, index) => sum + value * (vector[index] ?? 0), 0);
  const bottom = vector.reduce((sum, value) => sum + value * value, 0);
  return bottom === 0 ? 0 : top / bottom;
}
