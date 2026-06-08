/**
 * GSP (GST Suvidha Provider) client interface and White Books implementation.
 *
 * White Books (formerly Masters India / MasterGST) is the licensed GSP.
 * All GSTN API access goes through them.
 *
 * API pattern: every call requires these headers:
 *   client_id, client_secret, gst_username, state_cd, ip_address, txn
 * Plus `email` as a query parameter.
 */

import type { Gstr1Data, Gstr3bData } from '@runq/db';

// ── Types ──────────────────────────────────────────────────────────────

export interface OtpChallenge {
  success: boolean;
  message: string;
  txn?: string;  // transaction ID needed for auth token request
}

export interface GspAuthToken {
  accessToken: string;
  txn: string;          // transaction ID — required on every subsequent call
  expiresAt: Date;
}

export interface UploadResult {
  success: boolean;
  referenceId?: string;
  errors?: Array<{ code: string; message: string; section?: string }>;
}

export interface FilingResult {
  success: boolean;
  arn?: string;
  filedAt?: string;
  errors?: Array<{ code: string; message: string }>;
}

export interface Gstr1Summary {
  b2b: { count: number; taxableValue: number; igst: number; cgst: number; sgst: number; cess: number };
  b2cs: { taxableValue: number; igst: number; cgst: number; sgst: number; cess: number };
  b2cl: { count: number; taxableValue: number; igst: number };
  cdn: { count: number; taxableValue: number; igst: number; cgst: number; sgst: number; cess: number };
  hsn: { count: number };
  docs: { count: number };
}

// ── Interface ──────────────────────────────────────────────────────────

export interface GspClient {
  readonly provider: string;

  requestOtp(gstin: string, username: string): Promise<OtpChallenge>;
  verifyOtp(gstin: string, username: string, otp: string, txn: string): Promise<GspAuthToken>;
  logout(gstin: string, username: string, txn: string): Promise<{ success: boolean; message: string }>;

  requestEvcOtp(token: GspAuthToken, gstin: string, username: string, formType: 'GSTR1' | 'GSTR3B', signatoryPan?: string): Promise<{ success: boolean; message?: string }>;
  uploadGstr1(token: GspAuthToken, gstin: string, username: string, period: string, data: Gstr1Data): Promise<UploadResult>;
  getGstr1Summary(token: GspAuthToken, gstin: string, username: string, period: string): Promise<Gstr1Summary>;
  fileGstr1(token: GspAuthToken, gstin: string, username: string, period: string, evc: string, signatoryPan?: string): Promise<FilingResult>;

  getAutoPopulated3b(token: GspAuthToken, gstin: string, username: string, period: string): Promise<Gstr3bData>;
  saveGstr3b(token: GspAuthToken, gstin: string, username: string, period: string, data: Gstr3bData): Promise<UploadResult>;
  getRawGstr3bSummary(token: GspAuthToken, gstin: string, username: string, period: string): Promise<Record<string, unknown>>;
  fileGstr3b(token: GspAuthToken, gstin: string, username: string, period: string, evc: string, signatoryPan?: string, data?: Gstr3bData): Promise<FilingResult>;

  getGstr2b(token: GspAuthToken, gstin: string, username: string, period: string): Promise<unknown>;
}

// ── White Books Implementation ─────────────────────────────────────────

interface WhiteBooksConfig {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  email: string;
  sandbox: boolean;
}

function getConfig(): WhiteBooksConfig {
  return {
    baseUrl: process.env.MASTERS_INDIA_API_URL || 'https://apisandbox.whitebooks.in',
    clientId: process.env.MASTERS_INDIA_CLIENT_ID || '',
    clientSecret: process.env.MASTERS_INDIA_CLIENT_SECRET || '',
    email: process.env.MASTERS_INDIA_EMAIL || '',
    sandbox: process.env.MASTERS_INDIA_SANDBOX === 'true',
  };
}

/** Build the common headers required on every White Books API call. */
function commonHeaders(username: string, stateCode: string, txn?: string): Record<string, string> {
  const config = getConfig();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'client_id': config.clientId,
    'client_secret': config.clientSecret,
    'gst_username': username,
    'state_cd': stateCode,
    'ip_address': '127.0.0.1',
  };
  if (txn) headers['txn'] = txn;
  return headers;
}

/** Append email query param to a URL. */
function withEmail(path: string, extraParams?: Record<string, string>): string {
  const config = getConfig();
  const params = new URLSearchParams({ email: config.email, ...extraParams });
  const sep = path.includes('?') ? '&' : '?';
  return `${config.baseUrl}${path}${sep}${params.toString()}`;
}

/** Extract state code (first 2 digits) from GSTIN. */
function stateCodeFromGstin(gstin: string): string {
  return gstin.substring(0, 2);
}

export class WhiteBooksGspClient implements GspClient {
  readonly provider = 'whitebooks';

  async requestOtp(gstin: string, username: string): Promise<OtpChallenge> {
    const config = getConfig();
    if (!config.clientId || !config.clientSecret || !config.email) {
      return { success: false, message: 'GSP credentials not configured (MASTERS_INDIA_CLIENT_ID / _SECRET / _EMAIL)' };
    }

    const stateCode = stateCodeFromGstin(gstin);
    const url = withEmail('/authentication/otprequest');

    let res: Response;
    try {
      res = await fetch(url, { method: 'GET', headers: commonHeaders(username, stateCode) });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return { success: false, message: `Could not reach GSP at ${config.baseUrl}: ${reason}` };
    }

    // White Books returns non-JSON (HTML / plain text) on auth or GSP-access
    // rejection — read as text first so a parse failure surfaces the real
    // upstream status + body instead of throwing a 500.
    const raw = await res.text();
    let data: { status_cd?: string; status?: number; error?: { message?: string }; status_desc?: string; message?: string; txn?: string; header?: { txn?: string } };
    try {
      data = JSON.parse(raw);
    } catch {
      return { success: false, message: `GSP returned ${res.status} ${res.statusText}: ${raw.slice(0, 200) || '(empty body)'}` };
    }

    const success = data.status_cd === '1' || data.status === 1;
    return {
      success,
      message: data.error?.message || data.status_desc || data.message || (success ? 'OTP sent' : 'Failed'),
      txn: data.txn || data.header?.txn,
    };
  }

  async logout(gstin: string, username: string, txn: string): Promise<{ success: boolean; message: string }> {
    const stateCode = stateCodeFromGstin(gstin);
    const url = withEmail('/authentication/logout');
    const res = await fetch(url, {
      method: 'GET',
      headers: commonHeaders(username, stateCode, txn),
    });
    const data = await res.json();
    const success = data.status_cd === '1' || data.status === 1;
    return {
      success,
      message: data.error?.message || data.status_desc || (success ? 'Logged out' : 'Logout failed'),
    };
  }

  async verifyOtp(gstin: string, username: string, otp: string, txn: string): Promise<GspAuthToken> {
    const stateCode = stateCodeFromGstin(gstin);
    const url = withEmail('/authentication/authtoken', { otp });
    const headers = commonHeaders(username, stateCode, txn);

    const res = await fetch(url, { method: 'GET', headers });
    const data = await res.json();

    const success = data.status_cd === '1' || data.status === 1;
    if (!success) {
      throw new Error(`OTP verification failed: ${data.error?.message || data.message || 'Unknown error'}`);
    }

    // Token expires in 6 hours (360 minutes)
    const expiresAt = new Date(Date.now() + 360 * 60 * 1000);
    // White Books uses txn as the session identifier — no separate auth_token
    const activeTxn = data.txn || data.header?.txn || txn;
    return {
      accessToken: data.auth_token || data.authtoken || data.header?.auth_token || activeTxn,
      txn: activeTxn,
      expiresAt,
    };
  }

  // ── GSTR-1 ───────────────────────────────────────────────────────────

  async uploadGstr1(token: GspAuthToken, gstin: string, username: string, period: string, data: Gstr1Data): Promise<UploadResult> {
    const stateCode = stateCodeFromGstin(gstin);
    const url = withEmail('/gstr1/retsave');
    const headers = {
      ...commonHeaders(username, stateCode, token.txn),
      'gstin': gstin,
      'ret_period': period,
    };

    const payload = this.transformGstr1ForUpload(gstin, period, data);
    const res = await fetch(url, { method: 'PUT', headers, body: JSON.stringify(payload) });
    const result = await res.json();

    const success = result.status_cd === '1' || result.status === 1;
    const refid = result.data?.reference_id || result.reference_id || result.refid;

    if (success && refid) {
      // GSTN processes async — poll status until done before returning success
      const status = await this.pollRetStatus(token, gstin, username, period, refid);
      if (status.status !== 'P') {
        return {
          success: false,
          referenceId: refid,
          errors: [{
            code: status.errorCode || 'PROCESSING_FAILED',
            message: status.errorMessage || `GSTN returned status ${status.status}`,
          }],
        };
      }
    }

    return {
      success,
      referenceId: refid,
      errors: result.error ? [{ code: result.error.error_cd || '', message: result.error.message || '' }] : undefined,
    };
  }

  /** Poll /gstr/retstatus until processing completes.
   *  Status codes: P = Processed (success), IP = In Progress, PE = Processed with Error */
  private async pollRetStatus(
    token: GspAuthToken,
    gstin: string,
    username: string,
    period: string,
    refid: string,
  ): Promise<{ status: string; errorCode?: string; errorMessage?: string; errorReport?: unknown }> {
    const stateCode = stateCodeFromGstin(gstin);
    const url = withEmail('/gstr/retstatus', { gstin, returnperiod: period, refid });
    const headers = commonHeaders(username, stateCode, token.txn);

    for (let i = 0; i < 15; i++) {
      await new Promise((r) => setTimeout(r, i === 0 ? 1000 : 2000));
      const res = await fetch(url, { method: 'GET', headers });
      const data = await res.json();
      const status = data?.data?.status_cd || data?.status_cd;

      if (status === 'P') {
        return { status: 'P' };
      }
      if (status === 'PE') {
        // Processed with Error — surface ALL section errors, not just first
        const errorReport = data?.data?.error_report ?? data?.error_report;
        const messages: string[] = [];
        for (const section of ['b2b', 'b2cs', 'b2cl', 'cdnr', 'cdnur', 'hsn', 'nil', 'doc_issue', 'exp']) {
          const errs = errorReport?.[section];
          if (Array.isArray(errs)) {
            errs.slice(0, 5).forEach((e: { error_msg?: string; error_cd?: string }) => {
              if (e.error_msg) messages.push(`[${section}] ${e.error_cd || ''} ${e.error_msg}`);
            });
          }
        }
        // eslint-disable-next-line no-console
        console.log('[gsp-client] retstatus error_report:', JSON.stringify(errorReport).substring(0, 4000));
        return {
          status: 'PE',
          errorCode: 'GSTN_VALIDATION',
          errorMessage: messages.length > 0 ? messages.join(' | ') : 'Validation failed on GSTN',
          errorReport,
        };
      }
      if (status && status !== 'IP') {
        return { status, errorCode: data?.error?.error_cd, errorMessage: data?.error?.message };
      }
    }
    return { status: 'TIMEOUT', errorMessage: 'Polling timed out after 30 seconds' };
  }

  async getGstr1Summary(token: GspAuthToken, gstin: string, username: string, period: string): Promise<Gstr1Summary> {
    const stateCode = stateCodeFromGstin(gstin);
    const url = withEmail('/gstr1/retsum', { gstin, retperiod: period });
    const headers = commonHeaders(username, stateCode, token.txn);

    const res = await fetch(url, { method: 'GET', headers });
    const result = await res.json();
    const d = result.data || result;

    return {
      b2b: {
        count: d.b2b?.ttl_inv ?? d.sec_sum?.b2b?.ttl_rec ?? 0,
        taxableValue: d.b2b?.ttl_val ?? d.sec_sum?.b2b?.ttl_val ?? 0,
        igst: d.b2b?.ttl_igst ?? d.sec_sum?.b2b?.ttl_igst ?? 0,
        cgst: d.b2b?.ttl_cgst ?? d.sec_sum?.b2b?.ttl_cgst ?? 0,
        sgst: d.b2b?.ttl_sgst ?? d.sec_sum?.b2b?.ttl_sgst ?? 0,
        cess: d.b2b?.ttl_cess ?? d.sec_sum?.b2b?.ttl_cess ?? 0,
      },
      b2cs: {
        taxableValue: d.b2cs?.ttl_val ?? d.sec_sum?.b2cs?.ttl_val ?? 0,
        igst: d.b2cs?.ttl_igst ?? d.sec_sum?.b2cs?.ttl_igst ?? 0,
        cgst: d.b2cs?.ttl_cgst ?? d.sec_sum?.b2cs?.ttl_cgst ?? 0,
        sgst: d.b2cs?.ttl_sgst ?? d.sec_sum?.b2cs?.ttl_sgst ?? 0,
        cess: d.b2cs?.ttl_cess ?? d.sec_sum?.b2cs?.ttl_cess ?? 0,
      },
      b2cl: {
        count: d.b2cl?.ttl_inv ?? d.sec_sum?.b2cl?.ttl_rec ?? 0,
        taxableValue: d.b2cl?.ttl_val ?? d.sec_sum?.b2cl?.ttl_val ?? 0,
        igst: d.b2cl?.ttl_igst ?? d.sec_sum?.b2cl?.ttl_igst ?? 0,
      },
      cdn: {
        count: d.cdnr?.ttl_inv ?? d.sec_sum?.cdnr?.ttl_rec ?? 0,
        taxableValue: d.cdnr?.ttl_val ?? d.sec_sum?.cdnr?.ttl_val ?? 0,
        igst: d.cdnr?.ttl_igst ?? d.sec_sum?.cdnr?.ttl_igst ?? 0,
        cgst: d.cdnr?.ttl_cgst ?? d.sec_sum?.cdnr?.ttl_cgst ?? 0,
        sgst: d.cdnr?.ttl_sgst ?? d.sec_sum?.cdnr?.ttl_sgst ?? 0,
        cess: d.cdnr?.ttl_cess ?? d.sec_sum?.cdnr?.ttl_cess ?? 0,
      },
      hsn: { count: d.hsn?.ttl_rec ?? d.sec_sum?.hsn?.ttl_rec ?? 0 },
      docs: { count: d.doc_issue?.ttl_rec ?? d.sec_sum?.doc_issue?.ttl_rec ?? 0 },
    };
  }

  /** Trigger GSTN to send a fresh EVC OTP to the taxpayer's registered
   *  mobile/email for filing. Must be called before /retevcfile so the
   *  user has the OTP to enter. WhiteBooks endpoint: /authentication/otpforevc. */
  async requestEvcOtp(token: GspAuthToken, gstin: string, username: string, formType: 'GSTR1' | 'GSTR3B', signatoryPan?: string): Promise<{ success: boolean; message?: string }> {
    const stateCode = stateCodeFromGstin(gstin);
    // PAN must be the AUTHORIZED SIGNATORY's PAN (partner/director registered
    // on GST portal), not the firm/entity PAN embedded in the GSTIN.
    const pan = (signatoryPan ?? gstin.substring(2, 12)).toUpperCase();
    // GSTN expects the short form code: R1 / R3B (not the full "GSTR1").
    const gstnFormCode = formType === 'GSTR1' ? 'R1' : 'R3B';
    const url = withEmail('/authentication/otpforevc', { gstin, pan, form_type: gstnFormCode });
    const res = await fetch(url, {
      method: 'GET',
      headers: commonHeaders(username, stateCode, token.txn),
    });
    const data = await res.json();
    const success = data.status_cd === '1' || data.status === 1;
    return {
      success,
      message: success ? 'EVC OTP sent to registered mobile/email' : (data?.error?.message || data?.error?.error_msg || 'Failed to send EVC OTP'),
    };
  }

  async fileGstr1(token: GspAuthToken, gstin: string, username: string, period: string, evc: string, signatoryPan?: string): Promise<FilingResult> {
    const stateCode = stateCodeFromGstin(gstin);
    // PAN must match the AUTHORIZED SIGNATORY registered on GST portal,
    // not the firm/entity PAN embedded in the GSTIN.
    const pan = (signatoryPan ?? gstin.substring(2, 12)).toUpperCase();

    // Step 1: Move the return to "ready to file" state via newproceedfile.
    // RET00003 "already ready" is treated as success.
    const headersForProceed = commonHeaders(username, stateCode, token.txn);
    const proceedUrl = withEmail('/all/newproceedfile', { gstin, retperiod: period, type: 'GSTR1' });
    const proceedRes = await fetch(proceedUrl, { method: 'GET', headers: headersForProceed });
    const proceedData = await proceedRes.json();
    const proceedOk = proceedData.status_cd === '1' || proceedData.status === 1
      || proceedData?.error?.error_cd === 'RET00003';
    if (!proceedOk) {
      const e = proceedData?.error?.message || proceedData?.error?.error_msg || 'Could not move return to ready-to-file state';
      return { success: false, errors: [{ code: proceedData?.error?.error_cd || 'PROCEED_FAILED', message: e }] };
    }

    // Step 2: Poll summary endpoint for the LATEST checksum. GSTN can take
    // 30-60s to regenerate the summary after proceedfile. We pass summ_typ=L
    // to force latest (not cached). Poll every 6s for up to 90s.
    // smrytyp=L returns LONG summary; default (omitted) returns SHORT
    // summary which is what retevcfile compares its signed chksum against.
    const sumUrl = withEmail('/gstr1/retsum', { gstin, retperiod: period });
    let chksum: string | undefined;
    let lastSumData: { status_cd?: string; status?: number; error?: { message?: string; error_cd?: string } } | undefined;
    let summary: { chksum?: string; newSumFlag?: boolean; sec_sum?: unknown[] } | undefined;
    for (let attempt = 0; attempt < 15; attempt++) {
      await new Promise((r) => setTimeout(r, 6000));
      const sumRes = await fetch(sumUrl, { method: 'GET', headers: commonHeaders(username, stateCode, token.txn) });
      const sumData = await sumRes.json();
      lastSumData = sumData;
      const ok = sumData?.status_cd === '1' || sumData?.status === 1;
      const inner = sumData?.data ?? sumData;
      const candidate = inner?.chksum;
      if (ok && candidate) {
        chksum = candidate;
        summary = inner;
        break;
      }
    }
    if (!chksum || !summary) {
      const errMsg = lastSumData?.error?.message || 'Latest summary not available from GSTN after 90s. Try again in a few minutes.';
      return { success: false, errors: [{ code: lastSumData?.error?.error_cd || 'NO_CHKSUM', message: errMsg }] };
    }

    const url = withEmail('/gstr1/retevcfile', { pan, evcotp: evc });
    const headers = {
      ...commonHeaders(username, stateCode, token.txn),
      'gstin': gstin,
      'ret_period': period,
    };

    // Body per WhiteBooks /gstr1/retevcfile schema: requires newSumFlag and
    // sec_sum from the retsum response, not just chksum. Pass them through.
    const body = {
      gstin,
      ret_period: period,
      chksum,
      newSumFlag: summary.newSumFlag ?? true,
      sec_sum: summary.sec_sum ?? [],
    };

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    const result = await res.json();

    return {
      success: result.status_cd === '1' || result.status === 1,
      arn: result?.data?.ack_num || result.ack_num || result.arn,
      filedAt: result?.data?.ack_dt || result.ack_dt,
      errors: result.error ? [{ code: result.error.error_cd || '', message: result.error.message || '' }] : undefined,
    };
  }

  // ── GSTR-3B ──────────────────────────────────────────────────────────

  async getAutoPopulated3b(token: GspAuthToken, gstin: string, username: string, period: string): Promise<Gstr3bData> {
    const stateCode = stateCodeFromGstin(gstin);
    const url = withEmail('/gstr3b/retsum', { gstin, retperiod: period });
    const headers = commonHeaders(username, stateCode, token.txn);

    const res = await fetch(url, { method: 'GET', headers });
    const result = await res.json();
    return this.transformGstr3bResponse(result.data || result);
  }

  /** Fetch the GSTN-stored 3B summary in raw form, before transformation.
   *  Used by the post-save verification path so we can diff what we sent
   *  against what GSTN actually persisted — silent-drops (e.g. Table 5
   *  decimal-rejection) surface here without needing transformGstr3bResponse
   *  to be fully wired up. */
  async getRawGstr3bSummary(token: GspAuthToken, gstin: string, username: string, period: string): Promise<Record<string, unknown>> {
    const stateCode = stateCodeFromGstin(gstin);
    const url = withEmail('/gstr3b/retsum', { gstin, retperiod: period });
    const res = await fetch(url, { method: 'GET', headers: commonHeaders(username, stateCode, token.txn) });
    const result = await res.json();
    return (result?.data ?? result ?? {}) as Record<string, unknown>;
  }

  async saveGstr3b(token: GspAuthToken, gstin: string, username: string, period: string, data: Gstr3bData): Promise<UploadResult> {
    const stateCode = stateCodeFromGstin(gstin);
    const url = withEmail('/gstr3b/retsave');
    const headers = {
      ...commonHeaders(username, stateCode, token.txn),
      'gstin': gstin,
      'ret_period': period,
    };

    const payload = this.transformGstr3bForUpload(gstin, period, data);
    const res = await fetch(url, { method: 'PUT', headers, body: JSON.stringify(payload) });
    const result = await res.json();

    return {
      success: result.status_cd === '1' || result.status === 1,
      referenceId: result.reference_id || result.refid,
      errors: result.error ? [{ code: result.error.error_cd || '', message: result.error.message || '' }] : undefined,
    };
  }

  async fileGstr3b(token: GspAuthToken, gstin: string, username: string, period: string, evc: string, signatoryPan?: string, data?: Gstr3bData): Promise<FilingResult> {
    const stateCode = stateCodeFromGstin(gstin);
    const pan = (signatoryPan ?? gstin.substring(2, 12)).toUpperCase();
    // Tag every log line so the user can grep Railway logs for one
    // filing attempt across all three steps.
    const tag = `[GST 3B file ${gstin}/${period}]`;

    // Step 1: Offset liability (computes cash + ITC utilization for the
    // saved 3B).
    //
    // **KNOWN BROKEN** — Vrindavan Apr 042026 testing (May 17 2026)
    // proved WhiteBooks' /gstr3b/retoffset returns RT-3BAS1070
    // ("PARTIAL/EXCESS payment") regardless of payload values. Six
    // variants tested including the Rule-88A-correct allocation that
    // GSTN's portal performs internally (drain IGST credit first across
    // both CGST + SGST liabilities). Same error each time. Auth chain
    // proven healthy via retsave + retsum working in the same session.
    //
    // The actual GSTN endpoint the portal hits is dead simple:
    //   GET /returns/auth/api/gstr3b/offsetliab?rtn_prd=042026
    //   → {"status":1,"data":"{\"status_cd\":1}"}
    // Bare GET, NO body. GSTN computes offset server-side from saved
    // 3B + ITC + cash ledger. WhiteBooks needs to expose an equivalent
    // (likely `/gstr3b/offsetliab` or similar) or fix `/retoffset`.
    //
    // The Rule 88A allocation GSTN actually performs (from portal
    // DevTools capture, Vrindavan Apr 042026):
    //   IGST credit → CGST liability: full amount (₹6,184)
    //   IGST credit → SGST liability: full amount (₹6,184)
    //   own CGST/SGST credits: untouched
    // i.e. drain IGST first across both, only then own-head credits,
    // only then cash. `liab_id` is OUTPUT of offset, not input.
    //
    // Until WhiteBooks confirms the right endpoint, send the Rule-88A
    // correct pdcash + pditc body anyway — closest to what GSTN does
    // internally. May start working if WhiteBooks fixes their wrapper
    // without us redeploying. Falls back to legacy minimal body if
    // `data` isn't available (e.g. older call sites).
    const submitHeaders = { ...commonHeaders(username, stateCode, token.txn), gstin, ret_period: period };
    const submitBody: Record<string, unknown> = data
      ? buildRetoffsetBody(gstin, period, data)
      : { gstin, ret_period: period };
    console.log(`${tag} step1 retoffset PUT body=${JSON.stringify(submitBody)}`);
    const submitRes = await fetch(withEmail('/gstr3b/retoffset'), {
      method: 'PUT',
      headers: submitHeaders,
      body: JSON.stringify(submitBody),
    });
    const submitData = await submitRes.json();
    console.log(`${tag} step1 retoffset http=${submitRes.status} resp=${JSON.stringify(submitData)}`);
    const offsetOk = submitData?.status_cd === '1' || submitData?.status === 1
      // Some GSPs return a refid+ackno on async accept — treat as OK and rely on retsum.
      || !!submitData?.data?.reference_id || !!submitData?.data?.refid;
    if (!offsetOk && submitData?.error) {
      const err = submitData.error;
      console.error(`${tag} step1 retoffset FAILED`, JSON.stringify(submitData));
      const code = err.error_cd || err.code || 'OFFSET_FAILED';
      // Known GSTN error codes: rewrite to a clearer, single-line
      // message. The raw text is preserved in server logs above.
      const friendly: Record<string, string> = {
        'RT-3BGC-9017': 'GSTN saved-3B is out of sync with the offset pipeline (RT-3BGC-9017). Auto-healing by re-saving and retrying — if you still see this after one retry, wait 2 minutes and try again.',
      };
      return {
        success: false,
        errors: [{
          code,
          message: friendly[code]
            || (err.message || err.error_msg || 'Liability offset failed — payment may be pending. Check cash ledger and retry.').trim().replace(/\s+/g, ' '),
        }],
      };
    }

    // Step 2: Fetch the GSTN summary for the chksum needed by retevcfile.
    // WhiteBooks has wrapped the chksum under different keys across
    // versions; try the known locations before giving up.
    const sumUrl = withEmail('/gstr3b/retsum', { gstin, retperiod: period });
    const sumRes = await fetch(sumUrl, { method: 'GET', headers: commonHeaders(username, stateCode, token.txn) });
    const sumData = await sumRes.json();
    console.log(`${tag} step2 retsum http=${sumRes.status} resp=${JSON.stringify(sumData)}`);
    const chksum = sumData?.data?.chksum
      ?? sumData?.chksum
      ?? sumData?.data?.summary?.chksum
      ?? sumData?.data?.gstr3b?.chksum
      ?? sumData?.data?.data?.chksum;
    if (!chksum) {
      console.error(`${tag} step2 retsum NO_CHKSUM`, JSON.stringify(sumData));
      const apiErr = sumData?.error?.message || sumData?.error?.error_msg;
      return {
        success: false,
        errors: [{
          code: 'NO_CHKSUM',
          message: apiErr
            ? `GSTN summary error: ${apiErr}`
            : 'Could not fetch GSTR-3B checksum from GSTN summary. Liability offset may not have completed — wait a minute and retry, or re-upload the draft.',
        }],
      };
    }

    const url = withEmail('/gstr3b/retevcfile', { pan, evcotp: '***' });
    const headers = {
      ...commonHeaders(username, stateCode, token.txn),
      'gstin': gstin,
      'ret_period': period,
    };

    const fileBody = { gstin, ret_period: period, chksum, isnil: 'N' };
    console.log(`${tag} step3 retevcfile POST url=${url.replace(/evcotp=\*\*\*/, 'evcotp=<6digits>')} body=${JSON.stringify(fileBody)}`);
    const res = await fetch(withEmail('/gstr3b/retevcfile', { pan, evcotp: evc }), {
      method: 'POST',
      headers,
      body: JSON.stringify(fileBody),
    });
    const result = await res.json();
    console.log(`${tag} step3 retevcfile http=${res.status} resp=${JSON.stringify(result)}`);
    if (!(result.status_cd === '1' || result.status === 1)) {
      console.error(`${tag} step3 retevcfile FAILED`, JSON.stringify(result));
    }

    return {
      success: result.status_cd === '1' || result.status === 1,
      arn: result?.data?.ack_num || result.ack_num || result.arn,
      filedAt: result?.data?.ack_dt || result.ack_dt,
      errors: result.error ? [{ code: result.error.error_cd || '', message: result.error.message || '' }] : undefined,
    };
  }

  // ── GSTR-2B ──────────────────────────────────────────────────────────

  async getGstr2b(token: GspAuthToken, gstin: string, username: string, period: string): Promise<unknown> {
    const stateCode = stateCodeFromGstin(gstin);
    const url = withEmail('/gstr2b/all', { gstin, rtnprd: period });
    const headers = commonHeaders(username, stateCode, token.txn);

    const res = await fetch(url, { method: 'GET', headers });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`GSTN 2B fetch failed (HTTP ${res.status}): ${text.slice(0, 200)}`);
    }
    const result = await res.json();
    // GSTN error responses have status_cd !== '1'
    if (result.status_cd && result.status_cd !== '1') {
      const errMsg = result.error?.message || result.error?.error_msg || JSON.stringify(result.error ?? 'Unknown error');
      throw new Error(`GSTN 2B error: ${errMsg}`);
    }
    return result;
  }

  // ── Transform helpers ────────────────────────────────────────────────

  public transformGstr1ForUpload(gstin: string, period: string, data: Gstr1Data) {
    const supplierState = gstin.substring(0, 2);

    // Group B2B invoices by buyer GSTIN. When duplicate invoice numbers exist
    // (data anomaly), prefer the one with items over the empty one.
    const b2bByBuyer = new Map<string, Map<string, Gstr1Data['b2b'][number]>>();
    for (const inv of data.b2b) {
      const bucket = b2bByBuyer.get(inv.buyerGstin) ?? new Map();
      const existing = bucket.get(inv.invoiceNumber);
      // Skip if existing has items and this one doesn't
      if (existing && existing.items.length > 0 && inv.items.length === 0) {
        continue;
      }
      bucket.set(inv.invoiceNumber, inv);
      b2bByBuyer.set(inv.buyerGstin, bucket);
    }

    // Filter out invoices that still have no items (corrupted data)
    for (const [ctin, bucket] of b2bByBuyer) {
      for (const [num, inv] of bucket) {
        if (inv.items.length === 0) bucket.delete(num);
      }
      if (bucket.size === 0) b2bByBuyer.delete(ctin);
    }

    const b2b = Array.from(b2bByBuyer.entries()).map(([ctin, invoices]) => ({
      ctin,
      inv: Array.from(invoices.values()).map((inv) => {
        const isInterState = inv.placeOfSupply !== supplierState;
        return {
          inum: inv.invoiceNumber,
          idt: inv.invoiceDate,
          val: Number(inv.invoiceValue.toFixed(2)),
          pos: inv.placeOfSupply,
          rchrg: inv.reverseCharge,
          inv_typ: inv.invoiceType,
          itms: inv.items.map((it, idx) => ({
            num: idx + 1,
            itm_det: this.buildItmDet(it, isInterState),
          })),
        };
      }),
    }));

    return {
      gstin,
      fp: period,
      // Schema version per GSTR-1 Offline Tool. Bump via env when GSTN
      // releases a new version (e.g. GST3.2.5).
      version: process.env.GSTR1_SCHEMA_VERSION || 'GST3.2.4',
      // Literal string "hash" — not a computed value. Offline Tool emits
      // exactly this. Don't try to compute a real hash; that breaks it.
      hash: 'hash',
      // Gross turnover fields — required at top level. 0 is acceptable for
      // sandbox / partial data; populate from real cumulative turnover when
      // available.
      gt: 0,
      cur_gt: 0,
      b2b,
      // GSTN B2CS schema is oneOf inter/intra — emit ONLY the matching tax
      // fields. Sending both iamt and camt+samt fails the oneOf even when one
      // pair is zero.
      b2cs: data.b2cs.map((e) => {
        const base: Record<string, unknown> = {
          pos: e.placeOfSupply,
          sply_ty: e.supplyType,
          rt: Number(e.gstRate),
          txval: Number(e.taxableValue.toFixed(2)),
          typ: 'OE',
        };
        if (e.supplyType === 'INTER') {
          base.iamt = Number(e.igstAmount.toFixed(2));
        } else {
          base.camt = Number(e.cgstAmount.toFixed(2));
          base.samt = Number(e.sgstAmount.toFixed(2));
        }
        if (e.cessAmount > 0) base.csamt = Number(e.cessAmount.toFixed(2));
        return base;
      }),
      b2cl: data.b2cl.map((inv) => ({
        pos: inv.placeOfSupply,
        inv: [{
          inum: inv.invoiceNumber,
          idt: inv.invoiceDate,
          val: inv.invoiceValue,
          itms: [{
            num: 1,
            itm_det: { rt: inv.gstRate, txval: inv.taxableValue, iamt: inv.igstAmount },
          }],
        }],
      })),
      // CDN: group by buyer GSTIN, dedupe note numbers
      cdnr: this.buildCdnr(data.cdn, supplierState),
      // Nil-rated / exempt / non-GST supplies (Table 8). Only emit when
      // there are actual entries — empty `nil: { inv: [] }` fails validation.
      ...(data.nil.some((n) => n.exemptAmount > 0 || n.nilRatedAmount > 0 || n.nonGstAmount > 0)
        ? {
            nil: {
              inv: data.nil
                .filter((n) => n.exemptAmount > 0 || n.nilRatedAmount > 0 || n.nonGstAmount > 0)
                .map((n) => ({
                  sply_ty: n.supplyType === 'INTER' ? 'INTERB2C' : 'INTRB2C',
                  expt_amt: Number(n.exemptAmount.toFixed(2)),
                  nil_amt: Number(n.nilRatedAmount.toFixed(2)),
                  ngsup_amt: Number(n.nonGstAmount.toFixed(2)),
                })),
            },
          }
        : {}),
      // HSN summary — { hsn_b2b: [...] } envelope per Offline Tool v3.2.4.
      // Verified working against WhiteBooks prod /gstr1/retsave 2026-05-03.
      hsn: {
        hsn_b2b: data.hsn
          .filter((h) => Number(h.gstRate) > 0)
          .map((h, idx) => this.buildHsnEntry(h, idx + 1)),
      },
      doc_issue: {
        doc_det: data.docs.map((d, idx) => ({
          doc_num: this.docTypeCode(d.docType),
          docs: [{
            num: idx + 1,
            from: d.fromSerial,
            to: d.toSerial,
            totnum: d.totalIssued,
            cancel: d.totalCancelled,
            net_issue: d.netIssued,
          }],
        })),
      },
    };
  }

  /** Normalize free-form UoM strings ("500ml", "1kg", "200g") to GSTN's
   *  valid UQC enum (MLT, KGS, GMS, LTR, NOS, etc). Returns NOS as a safe
   *  default if no match — GSTN accepts NOS for "numbers/unspecified". */
  /** GSTN's authoritative UQC enum (extracted from GSTR-1 Excel template
   *  V2.2 master sheet, Oct 2025). Format: <CODE>-<DESCRIPTION>.
   *  Spelling matters — "GRAMMES" not "GRAMS", "MILILITRE" not "MILLILITRES". */
  /** GSTN's authoritative UQC enum (extracted from GSTR-1 Excel template
   *  V2.2 master sheet, Oct 2025). Wire format uses the SHORT 3-char code
   *  (KGS, LTR, NOS) — NOT the dash-separated description form. */
  private normalizeUqc(uom: string | undefined | null): string {
    if (!uom) return 'NOS';
    const s = uom.trim().toLowerCase();
    if (/(^|[\d\s])kg$/.test(s) || s === 'kgs' || s === 'kilogram' || s === 'kilograms') return 'KGS';
    if (/(^|[\d\s])g$/.test(s) || s === 'gms' || s === 'gram' || s === 'grams' || s === 'grammes') return 'GMS';
    if (/(^|[\d\s])(ml)$/.test(s) || s === 'mlt' || s === 'milliliter' || s === 'mililitre') return 'MLT';
    if (/(^|[\d\s])l$/.test(s) || /litre/.test(s) || /liter/.test(s) || s === 'ltr') return 'LTR';
    if (s === 'pcs' || s === 'pc' || s === 'piece' || s === 'pieces') return 'PCS';
    if (s === 'nos' || s === 'no' || s === 'unit' || s === 'unt' || s === 'each') return 'NOS';
    if (s === 'box' || s === 'boxes') return 'BOX';
    if (s === 'pkt' || s === 'pkts' || s === 'pack' || s === 'packs' || s === 'pac') return 'PAC';
    if (s === 'mtr' || s === 'meter' || s === 'metre' || s === 'meters') return 'MTR';
    if (s === 'set' || s === 'sets') return 'SET';
    if (s === 'doz' || s === 'dozen' || s === 'dozens') return 'DOZ';
    if (s === 'btl' || s === 'bottle' || s === 'bottles') return 'BTL';
    if (s === 'bag' || s === 'bags') return 'BAG';
    if (s === 'cartons' || s === 'ctn') return 'CTN';
    if (s === 'bdl' || s === 'bundle' || s === 'bundles') return 'BDL';
    if (s === 'bun' || s === 'bunches' || s === 'bunch') return 'BUN';
    if (s === 'can' || s === 'cans') return 'CAN';
    if (s === 'cms' || s === 'cm' || s === 'centimeter') return 'CMS';
    if (s === 'cbm' || s === 'cubic meter' || s === 'cubic metre') return 'CBM';
    if (s === 'drm' || s === 'drum' || s === 'drums') return 'DRM';
    if (s === 'kme' || s === 'kilometer' || s === 'kilometre' || s === 'km') return 'KME';
    if (s === 'klr' || s === 'kilolitre' || s === 'kilolitres') return 'KLR';
    if (s === 'mts' || s === 'metric ton' || s === 'mt') return 'MTS';
    if (s === 'ton' || s === 'tonne' || s === 'tonnes') return 'TON';
    if (s === 'qtl' || s === 'quintal' || s === 'quintals') return 'QTL';
    if (s === 'rol' || s === 'roll' || s === 'rolls') return 'ROL';
    if (s === 'sqf' || s === 'sqft' || s === 'square feet') return 'SQF';
    if (s === 'sqm' || s === 'square meter' || s === 'square metre') return 'SQM';
    if (s === 'sqy' || s === 'square yard') return 'SQY';
    if (s === 'tbs' || s === 'tablet' || s === 'tablets') return 'TBS';
    if (s === 'tub' || s === 'tube' || s === 'tubes') return 'TUB';
    if (s === 'prs' || s === 'pair' || s === 'pairs') return 'PRS';
    if (s === 'yds' || s === 'yard' || s === 'yards') return 'YDS';
    return 'OTH';
  }

  /** Build a single HSN summary entry. GSTN's HSN schema uses `oneOf`:
   *  inter-state (iamt only) OR intra-state (camt+samt only).
   *  Sending all 4 fields matches neither — must conditionally omit. */
  private buildHsnEntry(
    h: { hsnCode: string; description: string; uqc: string; totalQuantity: number; gstRate: number; taxableValue: number; igstAmount: number; cgstAmount: number; sgstAmount: number; cessAmount: number },
    num: number,
  ): Record<string, unknown> {
    // Verified format from GSTR-1 Offline Tool v3.2.4 generated payload
    // (2026-05-03). Required fields: num, hsn_sc, desc, user_desc, uqc,
    // qty, rt, txval, iamt, camt, samt, csamt — ALL present even if zero.
    // UQC is short code (KGS, LTR, NOS) — NOT the dash-separated form.
    const cleanDesc = h.description.replace(/[^a-zA-Z0-9 ]/g, '').trim().substring(0, 30);
    return {
      num,
      hsn_sc: h.hsnCode,
      desc: cleanDesc,
      user_desc: cleanDesc,
      uqc: this.normalizeUqc(h.uqc),
      qty: Number(h.totalQuantity.toFixed(2)),
      rt: Number(h.gstRate),
      txval: Number(h.taxableValue.toFixed(2)),
      iamt: Number(Number(h.igstAmount).toFixed(2)),
      camt: Number(Number(h.cgstAmount).toFixed(2)),
      samt: Number(Number(h.sgstAmount).toFixed(2)),
      csamt: Number(Number(h.cessAmount).toFixed(2)),
    };
  }

  /** Build itm_det respecting GSTN's strict schema:
   *  inter-state: only iamt (no camt/samt)
   *  intra-state: only camt + samt (no iamt)
   *  cess: always optional, omit if zero
   *  If item has mismatched fields (e.g. POS says inter but only camt/samt set),
   *  combine them into the appropriate field. */
  private buildItmDet(
    it: { gstRate: number; taxableValue: number; igstAmount: number; cgstAmount: number; sgstAmount: number; cessAmount: number },
    isInterState: boolean,
  ): Record<string, number> {
    const det: Record<string, number> = {
      rt: Number(it.gstRate),
      txval: Number(it.taxableValue.toFixed(2)),
    };

    const totalTax = it.igstAmount + it.cgstAmount + it.sgstAmount;

    if (isInterState) {
      // Inter-state — single IGST amount; if data was wrongly recorded as CGST/SGST, sum it up
      det.iamt = Number((it.igstAmount > 0 ? it.igstAmount : totalTax).toFixed(2));
    } else {
      // Intra-state — split into CGST + SGST
      if (it.cgstAmount > 0 || it.sgstAmount > 0) {
        det.camt = Number(it.cgstAmount.toFixed(2));
        det.samt = Number(it.sgstAmount.toFixed(2));
      } else if (it.igstAmount > 0) {
        // Wrongly recorded as IGST — split equally
        const half = it.igstAmount / 2;
        det.camt = Number(half.toFixed(2));
        det.samt = Number(half.toFixed(2));
      } else {
        det.camt = 0;
        det.samt = 0;
      }
    }

    if (it.cessAmount > 0) {
      det.csamt = Number(it.cessAmount.toFixed(2));
    }

    return det;
  }

  private buildCdnr(cdns: Gstr1Data['cdn'], supplierState: string) {
    const byBuyer = new Map<string, Map<string, Gstr1Data['cdn'][number]>>();
    for (const n of cdns) {
      const bucket = byBuyer.get(n.buyerGstin) ?? new Map();
      bucket.set(n.noteNumber, n);
      byBuyer.set(n.buyerGstin, bucket);
    }

    return Array.from(byBuyer.entries()).map(([ctin, notes]) => ({
      ctin,
      nt: Array.from(notes.values()).map((n) => {
        const pos = n.buyerGstin?.substring(0, 2) || supplierState;
        const isInterState = pos !== supplierState;
        return {
          ntty: n.noteType,
          nt_num: n.noteNumber,
          nt_dt: n.noteDate,
          pos,
          rchrg: 'N',
          inv_typ: 'R',
          val: Number(n.noteValue.toFixed(2)),
          itms: n.items.map((it, idx) => ({
            num: idx + 1,
            itm_det: this.buildItmDet(it, isInterState),
          })),
        };
      }),
    }));
  }

  private docTypeCode(docType: string): number {
    const map: Record<string, number> = {
      'Invoices for outward supply': 1,
      'Invoices for inward supply from unregistered person': 2,
      'Revised Invoice': 3,
      'Debit Note': 4,
      'Credit Note': 5,
      'Receipt voucher': 6,
      'Payment Voucher': 7,
      'Refund voucher': 8,
      'Delivery Challan for job work': 9,
      'Delivery Challan for supply on approval': 10,
      'Delivery Challan in case of liquid gas': 11,
      'Delivery Challan in cases other than by way of supply': 12,
    };
    return map[docType] ?? 1;
  }

  private transformGstr3bForUpload(gstin: string, period: string, data: Gstr3bData) {
    // GSTN schema validates numeric fields against a 2-decimal pattern;
    // raw JS sums like 6000.879999999999 fail. Round every numeric leaf
    // through this helper before serialising.
    const r = (n: number) => Math.round((n ?? 0) * 100) / 100;
    return {
      gstin,
      ret_period: period,
      sup_details: {
        osup_det: {
          txval: r(data.table31.outwardTaxableInterState.taxableValue + data.table31.outwardTaxableIntraState.taxableValue),
          iamt: r(data.table31.outwardTaxableInterState.igst),
          camt: r(data.table31.outwardTaxableIntraState.cgst),
          samt: r(data.table31.outwardTaxableIntraState.sgst),
          csamt: r((data.table31.outwardTaxableInterState.cess ?? 0) + (data.table31.outwardTaxableIntraState.cess ?? 0)),
        },
        osup_zero: {
          txval: r(data.table31.zeroRatedSupplies.taxableValue),
          iamt: r(data.table31.zeroRatedSupplies.igst),
          csamt: r(data.table31.zeroRatedSupplies.cess ?? 0),
        },
        osup_nil_exmp: { txval: r(data.table31.nilRatedExempt.taxableValue) },
        osup_nongst: { txval: r(data.table31.nonGstOutward.taxableValue) },
        // Table 3.1(d): Inward supplies liable to reverse charge
        isup_rev: {
          txval: 0,
          iamt: r(data.table4.itcAvailable.inwardReverseCharge.igst),
          camt: r(data.table4.itcAvailable.inwardReverseCharge.cgst),
          samt: r(data.table4.itcAvailable.inwardReverseCharge.sgst),
          csamt: r(data.table4.itcAvailable.inwardReverseCharge.cess),
        },
      },
      // Table 3.2: Inter-state supplies to unregistered/composition/UIN.
      // GSTN rejects rows with empty pos or zero values — only emit per
      // actual table32 entry (each carries its own 2-digit pos code).
      inter_sup: {
        unreg_details: data.table32
          .filter((e) => e.taxableValue > 0)
          .map((e) => ({ pos: e.placeOfSupply, txval: r(e.taxableValue), iamt: r(e.igst) })),
        comp_details: [],
        uin_details: [],
      },
      // Table 3.1.1: E-commerce supplies (added in GSTR-3B v7.1). We don't
      // track e-commerce sales yet — send zeros to satisfy the schema.
      // Strict JSON-schema validators reject the section being absent.
      eco_dtls: {
        eco_sup: { txval: 0, iamt: 0, camt: 0, samt: 0, csamt: 0 },
        eco_reg_sup: { txval: 0 },
      },
      itc_elg: (() => {
        // Per the WhiteBooks retsave reference payload, itc_elg sub-arrays
        // only carry rows with non-zero values. We previously sent all 5
        // itc_avl categories + both RUL/OTH for itc_rev/itc_inelg even
        // when zero — likely poisoning the save and silently dropping
        // sibling sections (canonical case: inward_sup never persisted
        // for Vrindavan Apr 042026 despite correct shape). Same filter
        // pattern we already apply to inter_sup.unreg_details and
        // inward_sup.isup_details.
        const nonZero = <T extends { iamt: number; camt: number; samt: number; csamt: number }>(row: T): boolean =>
          row.iamt > 0 || row.camt > 0 || row.samt > 0 || row.csamt > 0;
        const itcAvl = [
          { ty: 'IMPG' as const, iamt: r(data.table4.itcAvailable.importGoods.igst),        camt: r(data.table4.itcAvailable.importGoods.cgst),        samt: r(data.table4.itcAvailable.importGoods.sgst),        csamt: r(data.table4.itcAvailable.importGoods.cess) },
          { ty: 'IMPS' as const, iamt: r(data.table4.itcAvailable.importServices.igst),     camt: r(data.table4.itcAvailable.importServices.cgst),     samt: r(data.table4.itcAvailable.importServices.sgst),     csamt: r(data.table4.itcAvailable.importServices.cess) },
          { ty: 'ISRC' as const, iamt: r(data.table4.itcAvailable.inwardReverseCharge.igst), camt: r(data.table4.itcAvailable.inwardReverseCharge.cgst), samt: r(data.table4.itcAvailable.inwardReverseCharge.sgst), csamt: r(data.table4.itcAvailable.inwardReverseCharge.cess) },
          { ty: 'ISD'  as const, iamt: r(data.table4.itcAvailable.isd.igst),                 camt: r(data.table4.itcAvailable.isd.cgst),                 samt: r(data.table4.itcAvailable.isd.sgst),                 csamt: r(data.table4.itcAvailable.isd.cess) },
          { ty: 'OTH'  as const, iamt: r(data.table4.itcAvailable.allOtherItc.igst),         camt: r(data.table4.itcAvailable.allOtherItc.cgst),         samt: r(data.table4.itcAvailable.allOtherItc.sgst),         csamt: r(data.table4.itcAvailable.allOtherItc.cess) },
        ].filter(nonZero);
        const itcRev = [
          { ty: 'RUL' as const, iamt: r(data.table4.itcReversed.rule4243.igst), camt: r(data.table4.itcReversed.rule4243.cgst), samt: r(data.table4.itcReversed.rule4243.sgst), csamt: r(data.table4.itcReversed.rule4243.cess) },
          { ty: 'OTH' as const, iamt: r(data.table4.itcReversed.others.igst),    camt: r(data.table4.itcReversed.others.cgst),    samt: r(data.table4.itcReversed.others.sgst),    csamt: r(data.table4.itcReversed.others.cess) },
        ].filter(nonZero);
        // itc_inelg: we don't track ineligible ITC yet, so always empty
        // after filtering. Send the empty array so the schema key exists
        // (some validators require all top-level itc_elg keys present).
        const itcInelg: typeof itcRev = [];
        return {
          itc_avl: itcAvl,
          itc_rev: itcRev,
          itc_net: { iamt: r(data.table4.netItc.igst), camt: r(data.table4.netItc.cgst), samt: r(data.table4.netItc.sgst), csamt: r(data.table4.netItc.cess) },
          itc_inelg: itcInelg,
        };
      })(),
      // Table 5: Exempt, nil-rated, non-GST inward supplies.
      //
      // **KNOWN GAP** — GSTN silently drops the entire inward_sup section
      // from saves submitted via WhiteBooks' /gstr3b/retsave, even though
      // the payload shape is structurally correct (proven via portal save
      // round-trip: same {ty, inter, intra} shape persists when entered
      // on portal directly, dropped when sent via our API). Trigger is
      // something in our request envelope (header collision? body field
      // ordering? eco_dtls interaction?) — not the section structure.
      //
      // Mitigation: Layer 2 post-save verify (gst-return.service.ts
      // verify3b) detects this and surfaces a yellow warning card on the
      // 3B detail page with "Stored on GSTN: ₹0 (dropped)" so the user
      // knows to manually enter Table 5 on portal before clicking File.
      //
      // Fix path TBD: WhiteBooks support ticket (pending). When their
      // /retsave is fixed, this section will start persisting without
      // any code change here.
      //
      // We still send the correctly-shaped payload — keep the array
      // filtered to non-zero rows (matches WhiteBooks reference pattern;
      // all-zero NONGST row was speculative noise).
      inward_sup: {
        isup_details: ([
          {
            ty: 'GST' as const,
            inter: Math.round(data.table5.interState.nilRated + data.table5.interState.exempt),
            intra: Math.round(data.table5.intraState.nilRated + data.table5.intraState.exempt),
          },
          {
            ty: 'NONGST' as const,
            inter: Math.round(data.table5.interState.nonGst),
            intra: Math.round(data.table5.intraState.nonGst),
          },
        ]).filter((row) => row.inter > 0 || row.intra > 0),
      },
      // Table 5.1: Interest declared by taxpayer. Note: ltfee_details is
      // intentionally NOT sent at SAVE — GSTN computes late fees server-
      // side at FILE time based on actual submission timestamp. Including
      // ltfee_details here trips strict-validator schemas that disallow
      // additional properties on the SAVE shape.
      intr_ltfee: {
        intr_details: {
          iamt: r(data.table51.interestAmount ?? 0),
          camt: 0,
          samt: 0,
          csamt: 0,
        },
      },
    };
  }

  private transformGstr3bResponse(raw: Record<string, unknown>): Gstr3bData {
    return {
      table31: {
        outwardTaxableInterState: { taxableValue: 0, igst: 0, cess: 0 },
        outwardTaxableIntraState: { taxableValue: 0, cgst: 0, sgst: 0, cess: 0 },
        zeroRatedSupplies: { taxableValue: 0, igst: 0, cess: 0 },
        nilRatedExempt: { taxableValue: 0 },
        nonGstOutward: { taxableValue: 0 },
      },
      table32: [],
      table4: {
        itcAvailable: {
          importGoods: { igst: 0, cgst: 0, sgst: 0, cess: 0 },
          importServices: { igst: 0, cgst: 0, sgst: 0, cess: 0 },
          inwardReverseCharge: { igst: 0, cgst: 0, sgst: 0, cess: 0 },
          isd: { igst: 0, cgst: 0, sgst: 0, cess: 0 },
          allOtherItc: { igst: 0, cgst: 0, sgst: 0, cess: 0 },
        },
        itcReversed: {
          rule4243: { igst: 0, cgst: 0, sgst: 0, cess: 0 },
          others: { igst: 0, cgst: 0, sgst: 0, cess: 0 },
        },
        netItc: { igst: 0, cgst: 0, sgst: 0, cess: 0 },
      },
      table5: {
        interState: { nilRated: 0, exempt: 0, nonGst: 0 },
        intraState: { nilRated: 0, exempt: 0, nonGst: 0 },
      },
      table51: { interestAmount: 0, lateFee: 0 },
      table61: {
        igst: { payable: 0, itcUsed: 0, cashPaid: 0 },
        cgst: { payable: 0, itcUsed: 0, cashPaid: 0 },
        sgst: { payable: 0, itcUsed: 0, cashPaid: 0 },
        cess: { payable: 0, itcUsed: 0, cashPaid: 0 },
      },
    };
  }
}

/**
 * Build the pdcash + pditc body for /gstr3b/retoffset.
 *
 * Implements Rule 88A: IGST credit MUST be exhausted first — against
 * IGST liability, then against CGST, then against SGST. Only after IGST
 * is fully drained do we use own-head CGST/SGST credits. Anything still
 * unpaid hits the cash ledger. Confirmed via portal DevTools capture
 * (Vrindavan Apr 042026) — GSTN's own algorithm follows this exact
 * sequence and rejects any other allocation with RT-3BAS1070.
 *
 * Liability values are taken from data.table61 (post-88A compute by our
 * generator) and ITC availability from data.table4.netItc. All values
 * rounded to integer rupees (matches what GSTN's tx_pmt returns).
 */
function buildRetoffsetBody(gstin: string, period: string, data: Gstr3bData) {
  const r = (n: number) => Math.round(n || 0);
  const t6 = data.table61;
  const itc = data.table4.netItc;

  // IGST credit cascade per Rule 88A.
  let igstRemain = itc.igst;
  const igstToIgst = Math.min(igstRemain, t6.igst.payable);
  igstRemain -= igstToIgst;
  const igstToCgst = Math.min(igstRemain, t6.cgst.payable);
  igstRemain -= igstToCgst;
  const igstToSgst = Math.min(igstRemain, t6.sgst.payable);
  // (any igstRemain left over carries forward as unutilized ITC)

  // Own-head credit covers whatever IGST didn't.
  const cgstOwnUsed = Math.min(itc.cgst, t6.cgst.payable - igstToCgst);
  const sgstOwnUsed = Math.min(itc.sgst, t6.sgst.payable - igstToSgst);
  const cessUsed = Math.min(itc.cess, t6.cess.payable);

  return {
    gstin,
    ret_period: period,
    pdcash: [{
      // liab_ldg_id is OUTPUT not INPUT — GSTN generates it post-offset.
      // Sending 0 is correct per Vrindavan Apr 042026 test.
      liab_ldg_id: 0,
      trans_typ: 30002,
      ipd: r(t6.igst.cashPaid),
      cpd: r(t6.cgst.cashPaid),
      spd: r(t6.sgst.cashPaid),
      cspd: r(t6.cess.cashPaid),
      c_intrpd: 0, c_lfeepd: 0, cs_intrpd: 0,
      i_intrpd: 0, s_intrpd: 0, s_lfeepd: 0,
    }],
    pditc: {
      liab_ldg_id: 0,
      trans_typ: 30002,
      i_pdi: r(igstToIgst),
      i_pdc: r(igstToCgst),
      i_pds: r(igstToSgst),
      c_pdc: r(cgstOwnUsed),
      c_pdi: 0,                         // CGST → IGST not allowed (one-way)
      s_pdi: 0,                         // SGST → IGST not allowed
      s_pds: r(sgstOwnUsed),
      cs_pdcs: r(cessUsed),
    },
  };
}

// ── Factory ────────────────────────────────────────────────────────────

export function createGspClient(provider = 'whitebooks'): GspClient {
  switch (provider) {
    case 'whitebooks':
    case 'masters_india':
      return new WhiteBooksGspClient();
    default:
      throw new Error(`Unknown GSP provider: ${provider}`);
  }
}
