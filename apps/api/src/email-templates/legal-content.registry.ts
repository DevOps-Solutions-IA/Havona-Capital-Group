export const LEGAL_CONTENT_REGISTRY = [
  {
    key: 'corporate.footer.default',
    purpose: 'Identidad corporativa y datos de contacto configurados server-side.',
    status: 'LEGAL_REVIEW_REQUIRED',
  },
  {
    key: 'commercial.unsubscribe',
    purpose: 'Mecanismo de exclusión administrado por Communications Core.',
    status: 'LEGAL_REVIEW_REQUIRED',
  },
  {
    key: 'confidentiality.default',
    purpose: 'Aviso de confidencialidad cuando la política corporativa lo requiera.',
    status: 'LEGAL_REVIEW_REQUIRED',
  },
] as const;

export const LEGAL_CONTENT_BY_KEY = new Map(
  LEGAL_CONTENT_REGISTRY.map((entry) => [entry.key, entry]),
);
