from types import SimpleNamespace

from app.services.srs_service import sm2_update


def card(**kw):
    base = dict(easiness_factor=2.5, repetitions=0, interval_days=0, total_reviews=0)
    base.update(kw)
    return SimpleNamespace(**base)


def test_first_successes_follow_sm2_intervals():
    c = card()
    u = sm2_update(c, 5)
    assert u["interval_days"] == 1 and u["repetitions"] == 1
    c = card(repetitions=1, interval_days=1)
    assert sm2_update(c, 5)["interval_days"] == 6
    c = card(repetitions=2, interval_days=6)
    assert sm2_update(c, 5)["interval_days"] == round(6 * 2.5)


def test_failure_resets_repetitions_and_interval():
    u = sm2_update(card(repetitions=4, interval_days=30), 0)
    assert u["repetitions"] == 0 and u["interval_days"] == 1


def test_easiness_floor_and_review_counter():
    u = sm2_update(card(easiness_factor=1.3, total_reviews=7), 0)
    assert u["easiness_factor"] == 1.3
    assert u["total_reviews"] == 8
