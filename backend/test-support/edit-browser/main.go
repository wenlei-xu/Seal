// This fixture runs the actual desktop backend for browser integration tests.
// It exposes bootstrap credentials only through a private test file, never an HTTP endpoint.
package main

import (
	"context"
	"encoding/json"
	"io"
	"log"
	"os"
	"time"

	"infinite-canvas/backend/internal/bootstrap"
)

func main() {
	dataDir, readyFile := os.Getenv("BEEFTV_BROWSER_DATA_DIR"), os.Getenv("BEEFTV_BROWSER_READY_FILE")
	if dataDir == "" || readyFile == "" {
		log.Fatal("browser test data and private ready file are required")
	}
	runtime, err := bootstrap.Open(context.Background(), bootstrap.Config{Profile: bootstrap.ProfileDesktop, DataDir: dataDir, ListenAddr: "127.0.0.1:0", AutoMigrate: true})
	if err != nil {
		log.Fatal(err)
	}
	if err := runtime.Start(); err != nil {
		log.Fatal(err)
	}
	ready, _ := json.Marshal(map[string]string{"baseURL": runtime.BaseURL(), "launchToken": runtime.LaunchToken(), "uiBootstrapToken": runtime.UIBootstrapToken()})
	if err := os.WriteFile(readyFile, ready, 0600); err != nil {
		log.Fatal(err)
	}
	_, _ = io.Copy(io.Discard, os.Stdin)
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	if err := runtime.Close(ctx); err != nil {
		log.Fatal(err)
	}
}
