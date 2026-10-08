//go:build !windows

package transcription

import "os/exec"

func hideWindow(_ *exec.Cmd) {}
