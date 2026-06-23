from experiments.genshin_py.coverage_report import comparison_verdict, detect_coverage


def test_coverage_detector_identifies_nested_fields():
    coverage = detect_coverage(
        [
            {
                "characters": [
                    {
                        "level": 90,
                        "ascension": 6,
                        "rarity": 5,
                        "constellation": 2,
                        "talents": {"normal_talent": 9, "elemental_skill": 10, "burst": 10},
                        "weapon": {"level": 90, "refinement": 1},
                        "artifacts": [
                            {
                                "set_name": "Golden Troupe",
                                "slot": "flower",
                                "level": 20,
                                "rarity": 5,
                                "main_stat": {"name": "HP"},
                                "substats": [{"name": "CRIT Rate"}],
                            }
                        ],
                    }
                ],
                "current_resin": 120,
            }
        ]
    )

    assert coverage.level is True
    assert coverage.ascension is True
    assert coverage.rarity is True
    assert coverage.constellation is True
    assert coverage.talents is True
    assert coverage.normal_talent is True
    assert coverage.skill_talent is True
    assert coverage.burst_talent is True
    assert coverage.equipped_weapon is True
    assert coverage.weapon_level is True
    assert coverage.weapon_refinement is True
    assert coverage.equipped_artifacts is True
    assert coverage.artifact_set is True
    assert coverage.artifact_slot is True
    assert coverage.artifact_level is True
    assert coverage.artifact_rarity is True
    assert coverage.artifact_main_stat is True
    assert coverage.artifact_substats is True
    assert coverage.resin is True


def test_comparison_verdict_handles_partial_failures():
    coverage = detect_coverage([])

    assert comparison_verdict({"calculator_characters": "error", "character_details": "skipped"}, coverage) == (
        "inconclusive due to auth/API errors"
    )
