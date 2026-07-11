import { useState, useEffect, useCallback } from 'react';
import { documentStore, getDocumentVisibility, setDocumentVisibility, getAllVisibilitySettings } from '@/stores/documentStore';
import { MedicalDocument, DocumentType, DocumentVisibilityMode } from '@/types';
import { useAuth } from '@/hooks/useAuth';
import { useDocumentAudit } from '@/hooks/useDocumentAudit';

export const useDocuments = () => {
  const [documents, setDocuments] = useState<MedicalDocument[]>(documentStore.getAll());
  const { user } = useAuth();
  const { logAccess } = useDocumentAudit();

  useEffect(() => {
    const unsub = documentStore.subscribe(() => setDocuments(documentStore.getAll()));
    return unsub;
  }, []);

  const getPatientDocuments = useCallback((patientId: string): MedicalDocument[] => {
    if (!user) return [];

    // First isolate to this clinic via patientId + clinicId on document (if present) or trust patientId
    const all = documentStore.filter(d => d.patientId === patientId);

    if (user.role === 'super_admin') return all;

    if (user.role === 'admin' || user.role === 'reception') {
      return all;
    }

    if (user.role === 'doctor') {
      const doctorSpecialtyId = user.specialtyId;
      if (!doctorSpecialtyId) return [];

      // Filter to same specialty (allows collaboration within specialty for lab/radiology)
      const specDocs = all.filter(d => d.specialtyId === doctorSpecialtyId);
      const visibilityMode = getDocumentVisibility(doctorSpecialtyId);

      let visible: MedicalDocument[];
      if (visibilityMode === 'own_only') {
        // Own documents only — prescriptions always own_only
        visible = specDocs.filter(d => d.doctorId === user.id);
      } else {
        // specialty_all: can see lab/radiology from same specialty colleagues
        // but prescriptions are always restricted to own
        visible = specDocs.filter(d =>
          d.documentType === 'prescription' ? d.doctorId === user.id : true
        );
      }

      // Log access for sensitive document types
      visible.forEach(doc => {
        const action =
          doc.documentType === 'lab_test' ? 'view_lab' as const
          : doc.documentType === 'radiology' ? 'view_radiology' as const
          : 'view' as const;
        logAccess({
          userId: user.id,
          patientId,
          documentId: doc.id,
          action,
          clinicId: user.clinicId,
        });
      });

      return visible;
    }

    return [];
  }, [user, documents, logAccess]);

  const addDocument = useCallback((doc: Omit<MedicalDocument, 'id' | 'createdAt'>) => {
    const newDoc: MedicalDocument = {
      ...doc,
      id: `doc-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    documentStore.add(newDoc);

    if (user) {
      logAccess({
        userId: user.id,
        patientId: doc.patientId,
        documentId: newDoc.id,
        action: 'upload',
        clinicId: user.clinicId,
        metadata: { documentType: doc.documentType, specialtyId: doc.specialtyId },
      });
    }

    return newDoc;
  }, [user, logAccess]);

  const deleteDocument = useCallback((id: string) => {
    const doc = documentStore.get(d => d.id === id);
    documentStore.remove(d => d.id === id);

    if (user && doc) {
      logAccess({
        userId: user.id,
        patientId: doc.patientId,
        documentId: id,
        action: 'delete',
        clinicId: user.clinicId,
        metadata: { documentType: doc.documentType },
      });
    }
  }, [user, logAccess]);

  const getVisibility = useCallback((specialtyId: string): DocumentVisibilityMode => {
    return getDocumentVisibility(specialtyId);
  }, []);

  const updateVisibility = useCallback((specialtyId: string, mode: DocumentVisibilityMode) => {
    setDocumentVisibility(specialtyId, mode);
  }, []);

  const getAllVisibility = useCallback((): Record<string, DocumentVisibilityMode> => {
    return getAllVisibilitySettings();
  }, []);

  return {
    documents,
    getPatientDocuments,
    addDocument,
    deleteDocument,
    getVisibility,
    updateVisibility,
    getAllVisibility,
  };
};
