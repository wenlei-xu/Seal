/** A leading slash is a command; slashes in URLs and normal prose stay ordinary text. */
export function assistantSkillCommand(value: string) {
    const match = /^(\s*)\/([^\s/]*)/.exec(value);
    if (!match || value[match[0].length] === '/') return null;
    return { query: match[2], end: match[0].length };
}

export function removeAssistantSkillCommand(value: string) {
    const command = assistantSkillCommand(value);
    return command ? value.slice(command.end).replace(/^\s+/, '') : value;
}
