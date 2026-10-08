// Package releasebundle defines the files that must travel with a desktop update.
package releasebundle

import "strings"

func EditingFiles(platform string) []string {
	node, suffix := "runtime/bin/node", ""
	if strings.HasPrefix(platform, "windows-") {
		node, suffix = "runtime/node.exe", ".exe"
	}
	files := []string{"server.mjs", "runtime-manifest.json", node,
		"node_modules/hyperframes/package.json", "node_modules/@hypit/hypit/package.json",
		"media/browser/chrome-headless-shell" + suffix,
		"media/ffmpeg/bin/ffmpeg" + suffix, "media/ffmpeg/bin/ffprobe" + suffix}
	if suffix != "" {
		files = append(files, "media/asr/runtime-manifest.json", "media/asr/bin/whisper-cli.exe", "media/asr/models/ggml-base.bin")
	}
	return files
}
