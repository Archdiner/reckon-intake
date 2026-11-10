#!/usr/bin/env python3
"""Validate a coding-session archive without extracting any member.
Checks safe member names, regular files, no duplicates, manifest hashes
and sizes. Does not redact sensitive data or prove participant consent.
"""
import hashlib
import json
from pathlib import PurePosixPath
import sys
import tarfile

def validate(path, progress=None, quiet=False):
    with tarfile.open(path, 'r:gz') as archive:
        members = {}
        total = 0
        for member in archive:
            if len(members) >= 250:
                raise ValueError('too many archive members')
            name = member.name
            if (not member.isfile() or name.startswith('/') or '\\' in name
                    or any(part in ('', '.', '..') for part in name.split('/'))
                    or name in members):
                raise ValueError('unsafe or duplicate archive member')
            total += member.size
            if total > 512 * 1024**2:
                raise ValueError('archive exceeds validation size limit')
            members[name] = member
        if 'manifest.jsonl' not in members:
            raise ValueError('manifest missing')
        if members['manifest.jsonl'].size > 10 * 1024**2:
            raise ValueError('manifest too large')
        records = [json.loads(line) for line in archive.extractfile(members['manifest.jsonl']) if line.strip()]
        primaries = [r for r in records if r.get('role') != 'context']
        pconv = {r.get('conversation') or r['file'] for r in primaries}
        if not pconv or len(pconv) > 50 or len(records) > 248:
            raise ValueError('archive must contain 1-50 primary conversations')
        seen = set()
        for record in records:
            name = record['file']
            if name in seen or name not in members:
                raise ValueError('manifest missing or duplicate session')
            seen.add(name)
            data = archive.extractfile(members[name])
            digest = hashlib.sha256()
            while chunk := data.read(1024**2):
                digest.update(chunk)
            if members[name].size != record['bytes'] or digest.hexdigest() != record['sha256']:
                raise ValueError('session size or hash mismatch')
            if progress:
                progress(len(seen), len(records))
        extras = set(members) - seen - {'manifest.jsonl', 'summary.txt'}
        if extras:
            raise ValueError('unmanifested files: '+','.join(sorted(extras)))
        if not quiet:
            print('Verified', len(pconv), 'primary conversations in', len(primaries), 'primary files and', len(records) - len(primaries), 'context files;', total, 'uncompressed bytes')

if __name__ == '__main__':
    try:
        validate(sys.argv[1])
    except Exception as error:
        print('Archive rejected:', str(error), file=sys.stderr)
        sys.exit(1)
