import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Link2, Pencil } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Markdown, refRoute } from "../components/Markdown.tsx";
import { Button, Card, Chip, ErrorNote, Field, inputClass, Loading } from "../components/ui.tsx";
import { api, type NoteDetail as NoteData } from "../lib/api.ts";
import { cn, label, shortDate, slugify } from "../lib/format.ts";
import { NOTE_TYPES } from "./Notes.tsx";

type NoteType = keyof typeof NOTE_TYPES;

export function NoteDetail() {
  const { id = "" } = useParams();
  const creating = id === "new";
  const { data, error, isPending } = useQuery({ queryKey: ["note", id], queryFn: () => api.note(id), enabled: !creating });
  const [editing, setEditing] = useState(false);

  const crumbs = (title: string) => (
    <nav className="mb-4 flex items-center gap-1 text-xs text-slate-500">
      <Link to="/notes" className="hover:text-accent-600">
        Notes
      </Link>
      <ChevronRight size={12} />
      <span className="truncate text-slate-700 dark:text-slate-300">{title}</span>
    </nav>
  );

  if (creating) {
    return (
      <>
        {crumbs("New note")}
        <NoteEditor />
      </>
    );
  }
  if (isPending) return <Loading />;
  if (error || !data) return <ErrorNote error={error ?? "Not found"} />;

  if (editing) {
    return (
      <>
        {crumbs(data.title)}
        <NoteEditor note={data} onDone={() => setEditing(false)} />
      </>
    );
  }

  const t = NOTE_TYPES[data.type];
  return (
    <>
      {crumbs(data.title)}
      <div className="grid gap-6 lg:grid-cols-3">
        <article className="lg:col-span-2">
          <header className="mb-5 flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="hud-title text-3xl">{data.title}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <Chip tone={t.tone}>{t.label}</Chip>
                {data.tags.map((tag) => (
                  <span key={tag}>#{tag}</span>
                ))}
                <span>· Updated {shortDate(data.updated)}</span>
              </div>
            </div>
            <Button variant="ghost" onClick={() => setEditing(true)}>
              <Pencil size={15} /> Edit
            </Button>
          </header>
          <Card>{data.body ? <Markdown text={data.body} wikilinks={data.wikilinks} /> : <p className="text-sm text-slate-400">Empty note.</p>}</Card>
        </article>

        <aside className="space-y-4">
          <RefList title="Links" refs={data.links} />
          <Card>
            <h2 className="mb-3 text-sm font-semibold">Backlinks</h2>
            {data.backlinks.length ? (
              <ul className="space-y-1.5 text-sm">
                {data.backlinks.map((b) => (
                  <li key={b.id}>
                    <Link to={`/notes/${b.id}`} className="text-accent-600 hover:underline">
                      {b.title}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-400">No notes link here yet.</p>
            )}
          </Card>
        </aside>
      </div>
    </>
  );
}

function RefList({ title, refs }: { title: string; refs: string[] }) {
  if (!refs.length) return null;
  return (
    <Card>
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      <ul className="space-y-1.5 text-sm">
        {refs.map((ref) => {
          const route = refRoute(ref);
          const [kind, rid] = ref.split("/");
          const text = `${label(rid ?? ref)} · ${kind}`;
          return (
            <li key={ref} className="flex items-center gap-1.5">
              <Link2 size={13} className="text-slate-400" />
              {route ? (
                <Link to={route} className="text-accent-600 hover:underline">
                  {text}
                </Link>
              ) : (
                <span className="text-slate-500">{text}</span>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function NoteEditor({ note, onDone }: { note?: NoteData; onDone?: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [title, setTitle] = useState(note?.title ?? "");
  const [type, setType] = useState<NoteType>(note?.type ?? "note");
  const [tags, setTags] = useState(note?.tags.join(", ") ?? "");
  const [body, setBody] = useState(note?.body ?? "");

  const tagList = tags
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  const save = useMutation({
    mutationFn: () =>
      note
        ? api.updateNote(note.id, { title: title.trim(), type, tags: tagList, body })
        : api.createNote({ id: slugify(title), title: title.trim(), type, tags: tagList, body }),
    onSuccess: (n) => {
      qc.invalidateQueries();
      if (note) onDone?.();
      else navigate(`/notes/${n.id}`, { replace: true });
    },
  });

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (slugify(title)) save.mutate();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <Field label="Title">
          <input autoFocus={!note} className={cn(inputClass, "text-base font-medium")} value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Type">
          <select className={inputClass} value={type} onChange={(e) => setType(e.target.value as NoteType)}>
            {(Object.keys(NOTE_TYPES) as NoteType[]).map((k) => (
              <option key={k} value={k}>
                {NOTE_TYPES[k].label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Tags (comma separated)">
        <input className={inputClass} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="kubernetes, security" />
      </Field>
      <Field label="Body (Markdown, [[links]])">
        <textarea
          className={cn(inputClass, "min-h-80 font-mono text-[13px] leading-relaxed")}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={"## What I learned\n\n- ...\n\nRelated: [[kubernetes]]"}
        />
      </Field>
      <ErrorNote error={save.error} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => (note ? onDone?.() : navigate("/notes"))}>
          Cancel
        </Button>
        <Button type="submit" disabled={!slugify(title) || save.isPending}>
          {note ? "Save" : "Create"}
        </Button>
      </div>
    </form>
  );
}
