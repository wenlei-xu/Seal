//go:build windows

package transcription

import (
	"os/exec"
	"syscall"
)

func hideWindow(command *exec.Cmd) { command.SysProcAttr = &syscall.SysProcAttr{HideWindow: true} }
