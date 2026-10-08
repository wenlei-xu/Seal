import { useEffect, useId, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { LoaderCircle, Puzzle, Search, X } from 'lucide-react';
import { captureUserScope } from '@/lib/user-scope-guard';
import { listHubSkills, type HubSkill } from '@/services/api/skill-hub';
import { assistantSkillCommand, removeAssistantSkillCommand } from './assistant-skill-command';

type Options = {
    value: string;
    onChange: (value: string) => void;
    selected: HubSkill | null;
    onSelect: (skill: HubSkill | null) => void;
    disabled: boolean;
    streaming: boolean;
    composerRef: RefObject<HTMLElement | null>;
    editorRef: RefObject<HTMLTextAreaElement | null>;
};

export function useAssistantSkillPicker({ value, onChange, selected, onSelect, disabled, streaming, composerRef, editorRef }: Options) {
    const [scope] = useState(() => captureUserScope());
    const [buttonOpen, setButtonOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [dismissedSlash, setDismissedSlash] = useState<string | null>(null);
    const [active, setActive] = useState(0);
    const searchRef = useRef<HTMLInputElement>(null);
    const listId = useId();
    const command = assistantSkillCommand(value);
    const slashOpen = Boolean(command) && dismissedSlash !== value;
    const open = !disabled && !streaming && (buttonOpen || slashOpen);
    const skills = useQuery({
        queryKey: ['skill-hub', scope.userScope, scope.epoch],
        queryFn: ({ signal }) => listHubSkills(scope, signal),
        enabled: open || Boolean(selected),
    });
    const query = (buttonOpen ? search : command?.query || '').trim().toLowerCase();
    const available = skills.data?.skills.filter(skill => skill.enabled && !skill.problem) || [];
    const candidates = available.filter(skill => `${skill.displayName} ${skill.name} ${skill.description}`.toLowerCase().includes(query));
    const current = selected ? skills.data?.skills.find(skill => skill.id === selected.id) : null;
    const selectionError = !selected ? '' : skills.isError ? '无法确认所选技能，请重新读取或移除后再发送。'
        : skills.isPending ? '正在确认所选技能…'
            : !current || !current.enabled || current.problem ? '所选技能已停用、删除或不可用，请重新选择。' : '';

    useEffect(() => { setActive(0); }, [query, skills.data]);
    useEffect(() => { if(open) document.getElementById(`${listId}-${active}`)?.scrollIntoView({block:'nearest'}); }, [active,open,listId]);
    useEffect(() => { if (buttonOpen) searchRef.current?.focus(); }, [buttonOpen]);
    useEffect(() => { if (!streaming && (selected || open)) void skills.refetch(); }, [streaming]);
    useEffect(() => {
        if (!open) return;
        const close = (event: PointerEvent) => {
            if (!composerRef.current?.contains(event.target as Node)) { setButtonOpen(false); setDismissedSlash(value); }
        };
        document.addEventListener('pointerdown', close);
        return () => document.removeEventListener('pointerdown', close);
    }, [open, value, composerRef]);
    useEffect(() => {
        if (current && current.enabled && !current.problem && (current.contentHash !== selected?.contentHash || current.displayName !== selected?.displayName || current.version !== selected?.version)) onSelect(current);
    }, [current, selected, onSelect]);

    function close() { setButtonOpen(false); setDismissedSlash(value); editorRef.current?.focus(); }
    function choose(skill: HubSkill) {
        onSelect(skill);
        onChange(removeAssistantSkillCommand(value));
        setButtonOpen(false); setDismissedSlash(value);
        editorRef.current?.focus();
    }
    function onKeyDownCapture(event: KeyboardEvent<HTMLElement>) {
        if (!open || event.nativeEvent.isComposing || event.keyCode === 229) return;
        const target = event.target as HTMLElement;
        if (!target.closest('.canvas-assistant-input,.canvas-assistant-skill-menu')) return;
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return; }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault(); event.stopPropagation();
            if (candidates.length) setActive(index => (index + (event.key === 'ArrowDown' ? 1 : -1) + candidates.length) % candidates.length);
            return;
        }
        if ((event.key === 'Enter' || event.key === 'Tab') && !event.shiftKey && !target.closest('button')) {
            event.preventDefault(); event.stopPropagation();
            if (candidates.length) choose(candidates[Math.min(active, candidates.length - 1)]);
        }
    }
    return {
        onKeyDownCapture,
        blocked: Boolean(selectionError) || Boolean(command),
        chip: selected ? <span className="canvas-assistant-chip canvas-assistant-skill-chip" data-unavailable={Boolean(selectionError)}>
            <Puzzle size={12} aria-hidden="true" />{current?.displayName || selected.displayName}
            <button type="button" aria-label="移除指定技能" onClick={() => onSelect(null)}><X size={12} /></button>
        </span> : null,
        error: selectionError ? <span className="canvas-assistant-meta" role="status">{selectionError}{skills.isError ? <button type="button" onClick={() => void skills.refetch()}>重新读取</button> : null}</span> : null,
        button: <button type="button" className="canvas-assistant-skill-trigger" disabled={disabled || streaming} aria-label="选择技能" aria-expanded={open} aria-controls={open ? listId : undefined} aria-haspopup="listbox"
            onClick={() => { if (open) close(); else { setSearch(''); setDismissedSlash(value); setButtonOpen(true); void skills.refetch(); } }} title="选择技能 · 在消息开头输入 / 也可搜索">
            <Puzzle size={15} aria-hidden="true" /><span>技能</span>
        </button>,
        menu: open ? <div className="canvas-assistant-skill-menu" aria-label="技能选择菜单">
            <div className="canvas-assistant-skill-menu-heading"><strong>选择本轮技能</strong><button type="button" aria-label="关闭技能菜单" onClick={close}><X size={15} /></button></div>
            {buttonOpen ? <label className="canvas-assistant-skill-search"><Search size={14} aria-hidden="true" /><input ref={searchRef} aria-label="搜索可用技能" placeholder="搜索名称或用途" value={search} onChange={event => setSearch(event.target.value)} aria-controls={listId} aria-activedescendant={candidates.length ? `${listId}-${Math.min(active,candidates.length-1)}` : undefined} /></label> : <p className="canvas-assistant-meta">继续输入名称筛选 · ↑↓ 选择 · Enter 确认</p>}
            {skills.isPending ? <p className="canvas-assistant-skill-menu-status"><LoaderCircle size={15} className="canvas-assistant-skill-spinner" />正在读取技能…</p> : null}
            {skills.isError ? <p className="canvas-assistant-skill-menu-status" role="alert">读取技能失败。<button type="button" onClick={() => void skills.refetch()}>重试</button></p> : null}
            <div id={listId} role="listbox" aria-label="可用技能" className="canvas-assistant-skill-options">
                {candidates.map((skill,index) => <button type="button" role="option" id={`${listId}-${index}`} aria-selected={index === active} tabIndex={-1} key={skill.id} onMouseEnter={() => setActive(index)} onClick={() => choose(skill)}>
                    <Puzzle size={17} aria-hidden="true" /><span><strong>{skill.displayName}</strong><small>{skill.description}</small></span>
                </button>)}
            </div>
            {!skills.isPending && !skills.isError && !candidates.length ? <p className="canvas-assistant-skill-menu-status">{query ? '没有匹配的技能' : '没有已启用的可用技能'}</p> : null}
            <div className="canvas-assistant-skill-menu-footer"><span>仅对本轮生效</span><Link to="/skills">管理技能</Link></div>
        </div> : null,
    };
}
