interface FileNode {
  type: 'file';
  uri: string;
  bytes: Uint8Array;
}

interface DirNode {
  type: 'dir';
  uri: string;
  children: Map<string, FileNode | DirNode>;
}

const root: DirNode = { type: 'dir', uri: 'file:///', children: new Map() };

const splitPath = (uri: string): string[] => {
  const cleaned = uri.replace(/^file:\/\//, '').replace(/\/+$/, '');
  return cleaned.split('/').filter(Boolean);
};

const joinUri = (parts: string[]): string => 'file:///' + parts.join('/');

const findNode = (uri: string): FileNode | DirNode | null => {
  const parts = splitPath(uri);
  let node: DirNode = root;
  for (let i = 0; i < parts.length; i++) {
    const next = node.children.get(parts[i]);
    if (!next) return null;
    if (i === parts.length - 1) return next;
    if (next.type !== 'dir') return null;
    node = next;
  }
  return node;
};

const ensureParent = (uri: string, intermediates = false): DirNode => {
  const parts = splitPath(uri);
  parts.pop();
  let node: DirNode = root;
  for (const part of parts) {
    const next = node.children.get(part);
    if (!next) {
      if (!intermediates) throw new Error(`Parent missing for ${uri}`);
      const created: DirNode = { type: 'dir', uri: joinUri(splitPath(node.uri).concat(part)), children: new Map() };
      node.children.set(part, created);
      node = created;
    } else if (next.type !== 'dir') {
      throw new Error(`Parent ${part} is a file`);
    } else {
      node = next;
    }
  }
  return node;
};

const removeNode = (uri: string): void => {
  const parts = splitPath(uri);
  const name = parts.pop();
  if (!name) return;
  let node: DirNode = root;
  for (const p of parts) {
    const next = node.children.get(p);
    if (!next || next.type !== 'dir') return;
    node = next;
  }
  node.children.delete(name);
};

export class Directory {
  readonly uri: string;
  constructor(...parts: (string | Directory | File)[]) {
    const segs = parts.map((p) => (typeof p === 'string' ? p : p.uri));
    let joined = segs[0] ?? 'file:///';
    for (let i = 1; i < segs.length; i++) {
      joined = joined.replace(/\/$/, '') + '/' + segs[i].replace(/^\//, '');
    }
    if (!joined.startsWith('file://')) joined = 'file:///' + joined.replace(/^\/+/, '');
    this.uri = joined.endsWith('/') ? joined.slice(0, -1) : joined;
  }

  get exists(): boolean {
    const node = findNode(this.uri);
    return node?.type === 'dir';
  }

  create(opts: { intermediates?: boolean } = {}): void {
    if (this.exists) return;
    const parent = ensureParent(this.uri, opts.intermediates);
    const name = splitPath(this.uri).pop()!;
    parent.children.set(name, { type: 'dir', uri: this.uri, children: new Map() });
  }

  delete(): void {
    removeNode(this.uri);
  }

  list(): (File | Directory)[] {
    const node = findNode(this.uri);
    if (!node || node.type !== 'dir') return [];
    return Array.from(node.children.values()).map((child) =>
      child.type === 'dir' ? new Directory(child.uri) : new File(child.uri),
    );
  }
}

export class File {
  readonly uri: string;
  constructor(...parts: (string | Directory | File)[]) {
    const segs = parts.map((p) => (typeof p === 'string' ? p : p.uri));
    let joined = segs[0] ?? '';
    for (let i = 1; i < segs.length; i++) {
      joined = joined.replace(/\/$/, '') + '/' + segs[i].replace(/^\//, '');
    }
    if (!joined.startsWith('file://')) joined = 'file:///' + joined.replace(/^\/+/, '');
    this.uri = joined;
  }

  get exists(): boolean {
    const node = findNode(this.uri);
    return node?.type === 'file';
  }

  create(): void {
    const parent = ensureParent(this.uri, true);
    const name = splitPath(this.uri).pop()!;
    parent.children.set(name, { type: 'file', uri: this.uri, bytes: new Uint8Array() });
  }

  write(content: Uint8Array | string): void {
    let node = findNode(this.uri);
    if (!node) {
      this.create();
      node = findNode(this.uri);
    }
    if (!node || node.type !== 'file') throw new Error(`Not a file: ${this.uri}`);
    if (typeof content === 'string') {
      node.bytes = new TextEncoder().encode(content);
    } else {
      node.bytes = new Uint8Array(content);
    }
  }

  async bytes(): Promise<Uint8Array> {
    const node = findNode(this.uri);
    if (!node || node.type !== 'file') throw new Error(`File not found: ${this.uri}`);
    return node.bytes;
  }

  async text(): Promise<string> {
    const b = await this.bytes();
    return new TextDecoder().decode(b);
  }

  delete(): void {
    removeNode(this.uri);
  }
}

export const Paths = {
  document: 'file:///document',
  cache: 'file:///cache',
};

export const __testFs = {
  reset(): void {
    root.children.clear();
  },
  seedFile(uri: string, bytes: Uint8Array): void {
    const file = new File(uri);
    file.create();
    file.write(bytes);
  },
  ls(uri: string): string[] {
    const node = findNode(uri);
    if (!node || node.type !== 'dir') return [];
    return Array.from(node.children.keys());
  },
};
