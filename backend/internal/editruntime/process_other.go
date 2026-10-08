//go:build !windows

package editruntime

import "os/exec"

func hideWindow(_ *exec.Cmd) {}
