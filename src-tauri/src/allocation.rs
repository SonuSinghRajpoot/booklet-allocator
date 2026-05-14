use rand::seq::SliceRandom;
use rand::thread_rng;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StudentRow {
    pub id: String,
    pub data: std::collections::HashMap<String, String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CycleConfig {
    pub name: String,
    pub percentage: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EvaluatorEntry {
    pub id: String,
    pub explicit_pct: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EvaluatorAllocation {
    pub evaluator_id: String,
    pub student_ids: Vec<String>,
    pub booklet_count: usize,
    pub explicit_pct: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AllocationResult {
    pub cycle_name: String,
    pub pool_size: usize,
    pub allocations: Vec<EvaluatorAllocation>,
}

pub fn allocate(
    master_data: &[StudentRow],
    cycle: &CycleConfig,
    evaluators: &[EvaluatorEntry],
) -> Result<AllocationResult, String> {
    if evaluators.is_empty() {
        return Err("No evaluators provided".to_string());
    }

    let explicit_evaluators: Vec<&EvaluatorEntry> =
        evaluators.iter().filter(|e| e.explicit_pct.is_some()).collect();
    let free_evaluators: Vec<&EvaluatorEntry> =
        evaluators.iter().filter(|e| e.explicit_pct.is_none()).collect();

    let sum_pct: f64 = explicit_evaluators
        .iter()
        .filter_map(|e| e.explicit_pct)
        .sum();

    if sum_pct > 100.0 + 1e-9 {
        return Err(format!(
            "Evaluator percentages sum to {:.1}% which exceeds 100%. Please reduce them.",
            sum_pct
        ));
    }

    if sum_pct < 100.0 - 1e-9 && free_evaluators.is_empty() && !explicit_evaluators.is_empty() {
        let shortfall_pct = 100.0 - sum_pct;
        let pool =
            (master_data.len() as f64 * cycle.percentage / 100.0).ceil() as usize;
        let shortfall_booklets = (pool as f64 * shortfall_pct / 100.0).ceil() as usize;
        return Err(format!(
            "Evaluator percentages sum to {:.1}%, leaving {:.1}% ({} booklets) unallocated \
             with no free evaluators. Either add an evaluator without a percentage, or \
             increase existing percentages to 100%.",
            sum_pct, shortfall_pct, shortfall_booklets
        ));
    }

    let total_students = master_data.len();
    let pool = (total_students as f64 * cycle.percentage / 100.0).ceil() as usize;

    // Random sample from full master list (independent per cycle)
    let mut rng = thread_rng();
    let mut indices: Vec<usize> = (0..total_students).collect();
    indices.shuffle(&mut rng);
    let sample_ids: Vec<String> = indices
        .into_iter()
        .take(pool)
        .map(|i| master_data[i].id.clone())
        .collect();

    // Phase 1: compute floor allocations for explicit evaluators
    struct PhaseEntry<'a> {
        eval: &'a EvaluatorEntry,
        floor_count: usize,
        remainder: f64,
    }

    let mut phase_entries: Vec<PhaseEntry> = explicit_evaluators
        .iter()
        .map(|e| {
            let exact = pool as f64 * e.explicit_pct.unwrap() / 100.0;
            let floor_count = exact.floor() as usize;
            let remainder = exact - floor_count as f64;
            PhaseEntry {
                eval: e,
                floor_count,
                remainder,
            }
        })
        .collect();

    let phase1_sum: usize = phase_entries.iter().map(|e| e.floor_count).sum();
    let total_remainder = pool.saturating_sub(phase1_sum);

    let mut allocations: Vec<EvaluatorAllocation> = Vec::new();
    let mut cursor = 0usize;

    if !free_evaluators.is_empty() {
        // Phase 1 explicit allocations first
        for entry in &phase_entries {
            let slice = sample_ids[cursor..cursor + entry.floor_count].to_vec();
            allocations.push(EvaluatorAllocation {
                evaluator_id: entry.eval.id.clone(),
                student_ids: slice,
                booklet_count: entry.floor_count,
                explicit_pct: entry.eval.explicit_pct,
            });
            cursor += entry.floor_count;
        }

        // Distribute remainder among free evaluators
        let per_free = if free_evaluators.is_empty() {
            0
        } else {
            total_remainder / free_evaluators.len()
        };
        let leftover = if free_evaluators.is_empty() {
            0
        } else {
            total_remainder % free_evaluators.len()
        };

        for (i, eval) in free_evaluators.iter().enumerate() {
            let count = per_free + if i == free_evaluators.len() - 1 { leftover } else { 0 };
            let slice = sample_ids[cursor..cursor + count].to_vec();
            allocations.push(EvaluatorAllocation {
                evaluator_id: eval.id.clone(),
                student_ids: slice,
                booklet_count: count,
                explicit_pct: None,
            });
            cursor += count;
        }
    } else {
        // All evaluators have explicit %; use largest remainder method
        // Sort descending by remainder, grant 1 extra to top N entries
        let mut indices: Vec<usize> = (0..phase_entries.len()).collect();
        indices.sort_by(|&a, &b| {
            phase_entries[b]
                .remainder
                .partial_cmp(&phase_entries[a].remainder)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        for &idx in indices.iter().take(total_remainder) {
            phase_entries[idx].floor_count += 1;
        }

        for entry in &phase_entries {
            let slice = sample_ids[cursor..cursor + entry.floor_count].to_vec();
            allocations.push(EvaluatorAllocation {
                evaluator_id: entry.eval.id.clone(),
                student_ids: slice,
                booklet_count: entry.floor_count,
                explicit_pct: entry.eval.explicit_pct,
            });
            cursor += entry.floor_count;
        }
    }

    Ok(AllocationResult {
        cycle_name: cycle.name.clone(),
        pool_size: pool,
        allocations,
    })
}

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn make_students(n: usize) -> Vec<StudentRow> {
        (0..n)
            .map(|i| StudentRow {
                id: format!("student_{}", i),
                data: Default::default(),
            })
            .collect()
    }

    fn cycle(pct: f64) -> CycleConfig {
        CycleConfig {
            name: "Test Cycle".to_string(),
            percentage: pct,
        }
    }

    #[test]
    fn test_pool_size_ceil() {
        let students = make_students(340);
        let c = cycle(15.0);
        let evals = vec![EvaluatorEntry {
            id: "e@test.com".to_string(),
            explicit_pct: None,
        }];
        let result = allocate(&students, &c, &evals).unwrap();
        // ceil(340 * 0.15) = ceil(51.0) = 51
        assert_eq!(result.pool_size, 51);
        assert_eq!(result.allocations[0].booklet_count, 51);
    }

    #[test]
    fn test_free_evaluator_even_split() {
        let students = make_students(100);
        let c = cycle(100.0);
        let evals = vec![
            EvaluatorEntry { id: "a@x.com".to_string(), explicit_pct: None },
            EvaluatorEntry { id: "b@x.com".to_string(), explicit_pct: None },
            EvaluatorEntry { id: "c@x.com".to_string(), explicit_pct: None },
            EvaluatorEntry { id: "d@x.com".to_string(), explicit_pct: None },
        ];
        let result = allocate(&students, &c, &evals).unwrap();
        assert_eq!(result.pool_size, 100);
        let counts: Vec<usize> = result.allocations.iter().map(|a| a.booklet_count).collect();
        // 100 / 4 = 25 each, no leftover
        assert_eq!(counts, vec![25, 25, 25, 25]);
    }

    #[test]
    fn test_free_evaluator_leftover_goes_to_last() {
        let students = make_students(100);
        let c = cycle(100.0);
        let evals = vec![
            EvaluatorEntry { id: "a@x.com".to_string(), explicit_pct: None },
            EvaluatorEntry { id: "b@x.com".to_string(), explicit_pct: None },
            EvaluatorEntry { id: "c@x.com".to_string(), explicit_pct: None },
        ];
        let result = allocate(&students, &c, &evals).unwrap();
        let counts: Vec<usize> = result.allocations.iter().map(|a| a.booklet_count).collect();
        // 100 / 3 = 33 each, leftover 1 → last gets 34
        assert_eq!(counts[0], 33);
        assert_eq!(counts[1], 33);
        assert_eq!(counts[2], 34);
        assert_eq!(counts.iter().sum::<usize>(), 100);
    }

    #[test]
    fn test_largest_remainder_method() {
        // 10 students, 3 evaluators at 33%, 33%, 34% — check no student left unallocated
        let students = make_students(10);
        let c = cycle(100.0);
        let evals = vec![
            EvaluatorEntry { id: "a@x.com".to_string(), explicit_pct: Some(33.0) },
            EvaluatorEntry { id: "b@x.com".to_string(), explicit_pct: Some(33.0) },
            EvaluatorEntry { id: "c@x.com".to_string(), explicit_pct: Some(34.0) },
        ];
        let result = allocate(&students, &c, &evals).unwrap();
        let total: usize = result.allocations.iter().map(|a| a.booklet_count).sum();
        assert_eq!(total, 10);
    }

    #[test]
    fn test_largest_remainder_no_student_left() {
        // 7 students, 2 evaluators at 50% each → floor(3.5)+floor(3.5)=6, remainder=1
        let students = make_students(7);
        let c = cycle(100.0);
        let evals = vec![
            EvaluatorEntry { id: "a@x.com".to_string(), explicit_pct: Some(50.0) },
            EvaluatorEntry { id: "b@x.com".to_string(), explicit_pct: Some(50.0) },
        ];
        let result = allocate(&students, &c, &evals).unwrap();
        let total: usize = result.allocations.iter().map(|a| a.booklet_count).sum();
        assert_eq!(total, 7);
    }

    #[test]
    fn test_error_sum_over_100() {
        let students = make_students(50);
        let c = cycle(100.0);
        let evals = vec![
            EvaluatorEntry { id: "a@x.com".to_string(), explicit_pct: Some(60.0) },
            EvaluatorEntry { id: "b@x.com".to_string(), explicit_pct: Some(60.0) },
        ];
        let err = allocate(&students, &c, &evals).unwrap_err();
        assert!(err.contains("exceeds 100%"));
    }

    #[test]
    fn test_error_sum_under_100_no_free() {
        let students = make_students(50);
        let c = cycle(100.0);
        let evals = vec![
            EvaluatorEntry { id: "a@x.com".to_string(), explicit_pct: Some(40.0) },
            EvaluatorEntry { id: "b@x.com".to_string(), explicit_pct: Some(40.0) },
        ];
        let err = allocate(&students, &c, &evals).unwrap_err();
        assert!(err.contains("unallocated"));
    }

    #[test]
    fn test_mixed_explicit_and_free() {
        let students = make_students(100);
        let c = cycle(100.0);
        let evals = vec![
            EvaluatorEntry { id: "a@x.com".to_string(), explicit_pct: Some(20.0) },
            EvaluatorEntry { id: "b@x.com".to_string(), explicit_pct: Some(25.0) },
            EvaluatorEntry { id: "c@x.com".to_string(), explicit_pct: None },
        ];
        let result = allocate(&students, &c, &evals).unwrap();
        assert_eq!(result.allocations[0].booklet_count, 20); // 20% of 100
        assert_eq!(result.allocations[1].booklet_count, 25); // 25% of 100
        assert_eq!(result.allocations[2].booklet_count, 55); // remainder
        assert_eq!(result.pool_size, 100);
    }
}
