package appearance

import "testing"

func TestLegacyBrandMigrationPreservesCustomAssets(t *testing.T) {
	legacy := DefaultSetting()
	legacy.BrandName, legacy.BrandSlug = "BeefTV", "beeftv"
	legacy.SEOTitle = "BeefTV"
	legacy.LogoResourceID = "custom-logo"
	legacy.FooterCopyright = "© 2026 BeefTV."
	value := normalizeDocument(legacy)
	if value.BrandName != "Seal" || value.BrandSlug != "seal" || value.SEOTitle != "Seal" || value.FooterCopyright != "© 2026 Seal." || value.LogoResourceID != "custom-logo" {
		t.Fatalf("legacy migration = %#v", value)
	}
	legacy.BrandName, legacy.BrandSlug = "My Studio", "my-studio"
	value = normalizeDocument(legacy)
	if value.BrandName != "My Studio" || value.BrandSlug != "my-studio" {
		t.Fatal("custom brand was overwritten")
	}
}
