//go:build windows && beeftv_native_validation

package main

import (
	"fmt"
	"os"
	"strconv"
)

// Only the explicit validation build opens a WebView2 debugging listener.
// The production build has no debugging configuration or bootstrap replacement.
func init() {
	port, err := strconv.Atoi(os.Getenv("BEEFTV_TEST_CDP_PORT"))
	if err != nil || port < 1024 || port > 65535 {
		panic("native validation requires a dedicated CDP port")
	}
	// The Go WebView2 loader clears browser overrides in its package init.
	// Set this after dependency initialization, solely in this tagged test build.
	if err := os.Setenv("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", fmt.Sprintf("--remote-debugging-address=127.0.0.1 --remote-debugging-port=%d", port)); err != nil {
		panic(err)
	}
}
