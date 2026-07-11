import { useState, useEffect, useCallback } from 'react';
import { MedicalNote } from '@/types';
import { medicalNoteStore } from '@/stores/medicalNoteStore';
import { getToken } from '@/utils/authToken';

const API = '/api';

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

function normaliseNote(n: any): MedicalNote {
  return {
    id: n.id,
    patientId: n.patient_id,
    visitId: n.visit_id ?? '',
    doctorId: n.doctor_id,
    category: n.category ?? 'general',
    title: n.title,
    content: n.content,
    attachments: n.attachments ?? [],
    createdAt: n.created_at,
    updatedAt: n.updated_at,
  };
}

export const useMedicalNotes = (options?: { patientId?: string; visitId?: string }) => {
  const token = getToken();

  const [notes, setNotes] = useState<MedicalNote[]>(() =>
    token ? [] : medicalNoteStore.getAll()
  );

  const load = useCallback(async () => {
    if (!token) {
      setNotes(medicalNoteStore.getAll());
      return;
    }
    if (!options?.patientId) {
      setNotes([]);
      return;
    }
    try {
      const params = new URLSearchParams();
      params.set('patientId', options.patientId);
      if (options?.visitId) params.set('visitId', options.visitId);
      const data = await apiFetch<any[]>(`/medical-notes?${params}`);
      setNotes(data.map(normaliseNote));
    } catch {
      setNotes(medicalNoteStore.getAll());
    }
  }, [token, options?.patientId, options?.visitId]);

  useEffect(() => {
    load();
    if (!token) {
      const unsub = medicalNoteStore.subscribe(() =>
        setNotes([...medicalNoteStore.getAll()])
      );
      return unsub;
    }
  }, [token, options?.patientId, options?.visitId]);

  const addNote = async (data: Omit<MedicalNote, 'id' | 'createdAt' | 'updatedAt'> & { attachments?: MedicalNote['attachments'] }) => {
    if (!token) {
      const now = new Date().toISOString();
      return medicalNoteStore.add({ ...data, id: `mn-${Date.now()}`, createdAt: now, updatedAt: now });
    }
    const created = await apiFetch<any>('/medical-notes', {
      method: 'POST',
      body: JSON.stringify({
        patientId: data.patientId,
        visitId: data.visitId,
        category: data.category,
        title: data.title,
        content: data.content,
        attachments: data.attachments ?? [],
      }),
    });
    const note = normaliseNote(created);
    setNotes(prev => [note, ...prev]);
    return note;
  };

  const updateNote = async (id: string, data: Partial<MedicalNote>) => {
    if (!token) {
      medicalNoteStore.update(n => n.id === id, { ...data, updatedAt: new Date().toISOString() });
      return;
    }
    const updated = await apiFetch<any>(`/medical-notes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ category: data.category, title: data.title, content: data.content, attachments: data.attachments }),
    });
    setNotes(prev => prev.map(n => n.id === id ? normaliseNote(updated) : n));
  };

  const deleteNote = async (id: string) => {
    if (!token) {
      medicalNoteStore.remove(n => n.id === id);
      return;
    }
    await apiFetch(`/medical-notes/${id}`, { method: 'DELETE' });
    setNotes(prev => prev.filter(n => n.id !== id));
  };

  return { notes, addNote, updateNote, deleteNote, reload: load };
};
