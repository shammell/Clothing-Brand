from app.services.variants import build_variant_fields, make_sku, split_stock


def test_even_split():
    assert [v["stock"] for v in split_stock(["S", "M"], ["A", "B"], 8)] == [2, 2, 2, 2]


def test_remainder_goes_to_first_variants():
    assert [v["stock"] for v in split_stock(["S", "M"], ["A", "B"], 10)] == [3, 3, 2, 2]


def test_single_size_and_color_gets_everything():
    assert split_stock(["S"], ["A"], 7) == [{"size": "S", "color": "A", "stock": 7}]


def test_zero_stock():
    assert all(v["stock"] == 0 for v in split_stock(["S", "M"], ["A"], 0))


def test_total_preserved_and_sku_format():
    fields = build_variant_fields("abcdef123456", split_stock(["S", "XL"], ["Navy Blue"], 11))
    assert fields["stock"] == 11
    assert fields["variants"][0]["sku"] == "123456-S-NAVY-BLUE"
    assert make_sku("abcdef123456", "M", "Black") == "123456-M-BLACK"
