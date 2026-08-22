import { CORPORATE_EMAIL_LIBRARY, CORPORATE_EMAIL_LIBRARY_BY_KEY } from '@havona/contracts';

describe('HAVONA Corporate Email Library', () => {
  it('conserva las 32 claves iniciales y añade solo tres gaps diferenciados', () => {
    expect(CORPORATE_EMAIL_LIBRARY).toHaveLength(35);
    expect(new Set(CORPORATE_EMAIL_LIBRARY.map((item) => item.key)).size).toBe(35);
    expect(CORPORATE_EMAIL_LIBRARY_BY_KEY.has('prospecting.no_response_followup')).toBe(true);
    expect(CORPORATE_EMAIL_LIBRARY_BY_KEY.has('meeting.post_meeting_summary')).toBe(true);
    expect(CORPORATE_EMAIL_LIBRARY_BY_KEY.has('documents.received_confirmation')).toBe(true);
  });

  it('define contratos completos, stop conditions y revisión legal humana', () => {
    for (const template of CORPORATE_EMAIL_LIBRARY) {
      expect(template.subject.trim()).not.toBe('');
      expect(template.stopEvents.length).toBeGreaterThan(0);
      expect(template.requiredVariables.length).toBeGreaterThan(0);
      expect(template.editableSections.length).toBeGreaterThan(0);
      expect(template.lockedSections).toEqual(
        expect.arrayContaining(['legal', 'unsubscribe', 'footer']),
      );
      expect(template.legalStatus).toBe('LEGAL_REVIEW_REQUIRED');
      expect(template.locale).toBe('es-CO');
    }
  });

  it('gobierna prospección saliente como comercial con opt-out', () => {
    const outbound = [
      'prospecting.introduction',
      'prospecting.referral',
      'prospecting.corporate',
      'prospecting.reactivation',
      'prospecting.no_response_followup',
    ].map((key) => CORPORATE_EMAIL_LIBRARY_BY_KEY.get(key)!);
    expect(outbound.every((item) => item.classification === 'COMMERCIAL')).toBe(true);
    expect(outbound.every((item) => item.consentPolicyReference === 'commercial.unsubscribe')).toBe(
      true,
    );
  });

  it('impide inferir no-show, pagos y emisión sin evidencia autorizada', () => {
    const noShow = CORPORATE_EMAIL_LIBRARY_BY_KEY.get('meeting.no_show_followup')!;
    expect(noShow.requiredEvidence).toEqual(
      expect.arrayContaining(['ATTENDANCE_PROVIDER_EVENT_OR_EXPLICIT_MARK']),
    );
    const payment = CORPORATE_EMAIL_LIBRARY_BY_KEY.get('payment.failed')!;
    expect(payment.automationEligible).toBe(false);
    expect(payment.requiredEvidence).toEqual(
      expect.arrayContaining(['AUTHORITATIVE_PAYMENT_FAILURE']),
    );
    const issued = CORPORATE_EMAIL_LIBRARY_BY_KEY.get('onboarding.policy_issued')!;
    expect(issued.requiredEvidence).toEqual(
      expect.arrayContaining(['AUTHORITATIVE_POLICY_ISSUED_EVIDENCE']),
    );
  });

  it('no permite política de autoenvío a masters sensibles', () => {
    for (const key of ['proposal.delivery', 'cancellation.retention', 'payment.failed']) {
      expect(CORPORATE_EMAIL_LIBRARY_BY_KEY.get(key)?.automationPolicy).not.toBe(
        'AUTOMATION_ALLOWED',
      );
    }
  });
});
