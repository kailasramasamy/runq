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

  uploadGstr1(token: GspAuthToken, gstin: string, username: string, period: string, data: Gstr1Data): Promise<UploadResult>;
  getGstr1Summary(token: GspAuthToken, gstin: string, username: string, period: string): Promise<Gstr1Summary>;
  fileGstr1(token: GspAuthToken, gstin: string, username: string, period: string, evc: string): Promise<FilingResult>;

  getAutoPopulated3b(token: GspAuthToken, gstin: string, username: string, period: string): Promise<Gstr3bData>;
  saveGstr3b(token: GspAuthToken, gstin: string, username: string, period: string, data: Gstr3bData): Promise<UploadResult>;
  fileGstr3b(token: GspAuthToken, gstin: string, username: string, period: string, evc: string): Promise<FilingResult>;

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
    const stateCode = stateCodeFromGstin(gstin);
    const url = withEmail('/authentication/otprequest');
    const res = await fetch(url, {
      method: 'GET',
      headers: commonHeaders(username, stateCode),
    });

    const data = await res.json();
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
    // Debug: log payload sections in a single atomic line each (no \n inside)
    // so log streams don't interleave concurrent writes.
    // eslint-disable-next-line no-console
    console.log('[gsp-client] HSN section: ' + JSON.stringify(payload.hsn).substring(0, 4000));
    // eslint-disable-next-line no-console
    console.log('[gsp-client] nil section: ' + JSON.stringify(payload.nil));
    // eslint-disable-next-line no-console
    console.log('[gsp-client] b2cs section: ' + JSON.stringify(payload.b2cs));
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
        // Processed with Error — extract details
        const errorReport = data?.data?.error_report;
        const firstError = errorReport?.b2b?.[0]?.error_msg || errorReport?.cdnr?.[0]?.error_msg || 'Validation failed on GSTN';
        return {
          status: 'PE',
          errorCode: 'GSTN_VALIDATION',
          errorMessage: firstError,
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

  async fileGstr1(token: GspAuthToken, gstin: string, username: string, period: string, evc: string): Promise<FilingResult> {
    const stateCode = stateCodeFromGstin(gstin);
    const pan = gstin.substring(2, 12);

    // Step 1: Trigger summary generation. Try both old and new proceedfile endpoints.
    const headersForProceed = commonHeaders(username, stateCode, token.txn);

    // Try old /all/proceedfile first (simpler params)
    const oldUrl = withEmail('/all/proceedfile', { gstin, retperiod: period, type: 'GSTR1' });
    const oldRes = await fetch(oldUrl, { method: 'GET', headers: headersForProceed });
    const oldData = await oldRes.json();

    // If old endpoint failed, try /all/newproceedfile
    if (oldData.status_cd !== '1' && oldData.status !== 1) {
      const newUrl = withEmail('/all/newproceedfile', { gstin, retperiod: period, type: 'GSTR1', isNil: 'N' });
      await fetch(newUrl, { method: 'GET', headers: headersForProceed });
    }

    // Wait for summary generation (server-side processing)
    await new Promise((r) => setTimeout(r, 5000));

    // Step 2: Fetch summary to get checksum
    const sumUrl = withEmail('/gstr1/retsum', { gstin, retperiod: period });
    const sumRes = await fetch(sumUrl, { method: 'GET', headers: commonHeaders(username, stateCode, token.txn) });
    const sumData = await sumRes.json();
    const chksum = sumData?.data?.chksum || sumData?.chksum || sumData?.data?.summ?.chksum || sumData?.header?.chksum;
    if (!chksum) {
      const errMsg = sumData?.error?.message || 'Could not fetch GSTR-1 checksum from GSTN summary';
      return { success: false, errors: [{ code: sumData?.error?.error_cd || 'NO_CHKSUM', message: errMsg }] };
    }

    const url = withEmail('/gstr1/retevcfile', { pan, evcotp: evc });
    const headers = {
      ...commonHeaders(username, stateCode, token.txn),
      'gstin': gstin,
      'ret_period': period,
    };

    const body = {
      gstin,
      ret_period: period,
      chksum,
      summ_typ: 'L',
      isnil: 'N',
    };

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    const result = await res.json();

    return {
      success: result.status_cd === '1' || result.status === 1,
      arn: result.ack_num || result.arn,
      filedAt: result.ack_dt,
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

  async fileGstr3b(token: GspAuthToken, gstin: string, username: string, period: string, evc: string): Promise<FilingResult> {
    const stateCode = stateCodeFromGstin(gstin);
    const pan = gstin.substring(2, 12);

    // Step 1: Submit
    const submitHeaders = { ...commonHeaders(username, stateCode, token.txn), gstin, ret_period: period };
    const submitRes = await fetch(withEmail('/gstr3b/retoffset'), {
      method: 'PUT',
      headers: submitHeaders,
      body: JSON.stringify({ gstin, ret_period: period }),
    });
    await submitRes.json();
    // Some flows skip retoffset; for 3B the offset call generates liability.
    // If not available, we proceed to fetch summary anyway.

    // Step 2: Fetch summary for checksum
    const sumUrl = withEmail('/gstr3b/retsum', { gstin, retperiod: period });
    const sumRes = await fetch(sumUrl, { method: 'GET', headers: commonHeaders(username, stateCode, token.txn) });
    const sumData = await sumRes.json();
    const chksum = sumData?.data?.chksum || sumData?.chksum;
    if (!chksum) {
      return { success: false, errors: [{ code: 'NO_CHKSUM', message: 'Could not fetch GSTR-3B checksum from GSTN summary' }] };
    }

    const url = withEmail('/gstr3b/retevcfile', { pan, evcotp: evc });
    const headers = {
      ...commonHeaders(username, stateCode, token.txn),
      'gstin': gstin,
      'ret_period': period,
    };

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ gstin, ret_period: period, chksum, isnil: 'N' }),
    });
    const result = await res.json();

    return {
      success: result.status_cd === '1' || result.status === 1,
      arn: result.ack_num || result.arn,
      filedAt: result.ack_dt,
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

  private transformGstr1ForUpload(gstin: string, period: string, data: Gstr1Data) {
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
      // Nil-rated / exempt / non-GST supplies (Table 8). WhiteBooks schema:
      //   nil: { inv: [{ sply_ty, expt_amt, nil_amt, ngsup_amt }] }
      // sply_ty values: INTRB2B / INTRB2C / INTERB2B / INTERB2C
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
      // HSN summary — try flat array form. WhiteBooks postman doc shows
      // `hsn: { data: [...] }` envelope but the schema's "no subschema
      // matched out of 2" error suggests it accepts either flat array or
      // wrapped object. Flat array is the older GSTN format and matches
      // what most GSP implementations actually accept.
      hsn: data.hsn
        .filter((h) => Number(h.gstRate) > 0)
        .map((h, idx) => this.buildHsnEntry(h, idx + 1)),
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
  private normalizeUqc(uom: string | undefined | null): string {
    if (!uom) return 'NOS';
    const s = uom.trim().toLowerCase();
    if (/(^|[\d\s])kg$/.test(s) || s === 'kgs' || s === 'kilogram') return 'KGS';
    if (/(^|[\d\s])g$/.test(s) || s === 'gms' || s === 'gram') return 'GMS';
    if (/(^|[\d\s])(ml)$/.test(s) || s === 'mlt' || s === 'milliliter') return 'MLT';
    if (/(^|[\d\s])l$/.test(s) || /litre/.test(s) || /liter/.test(s) || s === 'ltr') return 'LTR';
    if (s === 'pcs' || s === 'pc' || s === 'piece' || s === 'pieces') return 'PCS';
    if (s === 'nos' || s === 'no' || s === 'unit' || s === 'each') return 'NOS';
    if (s === 'box' || s === 'boxes') return 'BOX';
    if (s === 'pkt' || s === 'pkts' || s === 'pack') return 'PAC';
    if (s === 'mtr' || s === 'meter' || s === 'metre') return 'MTR';
    if (s === 'set' || s === 'sets') return 'SET';
    if (s === 'doz' || s === 'dozen') return 'DOZ';
    return 'NOS';
  }

  /** Build a single HSN summary entry. GSTN's HSN schema uses `oneOf`:
   *  inter-state (iamt only) OR intra-state (camt+samt only).
   *  Sending all 4 fields matches neither — must conditionally omit. */
  private buildHsnEntry(
    h: { hsnCode: string; description: string; uqc: string; totalQuantity: number; gstRate: number; taxableValue: number; igstAmount: number; cgstAmount: number; sgstAmount: number; cessAmount: number },
    num: number,
  ): Record<string, unknown> {
    const cleanDesc = h.description.replace(/[^a-zA-Z0-9 ]/g, '').trim().substring(0, 30);
    // GSTR-1 HSN master is 6-digit (CBIC Notification 78/2020). 8-digit codes
    // belong to the customs HSN master and aren't recognized by the filing
    // validator. Truncate to 6-digit for the payload while keeping our source
    // data 8-digit (more granular for internal reports).
    const hsnForFiling = h.hsnCode.length === 8 ? h.hsnCode.substring(0, 6) : h.hsnCode;
    const entry: Record<string, unknown> = {
      num,
      hsn_sc: hsnForFiling,
      desc: cleanDesc,
      uqc: this.normalizeUqc(h.uqc),
      qty: Number(h.totalQuantity.toFixed(2)),
      rt: Number(h.gstRate),
      txval: Number(h.taxableValue.toFixed(2)),
    };
    // GSTN's HSN entry schema is oneOf intra-state vs inter-state. Emit
    // exactly the matching tax fields; sending both pairs (or sending iamt
    // when igst is 0) fails validation. csamt is always present (0 if no
    // cess) per the canonical sample.
    if (Number(h.igstAmount) > 0) {
      entry.iamt = Number(Number(h.igstAmount).toFixed(2));
    } else {
      entry.camt = Number(Number(h.cgstAmount).toFixed(2));
      entry.samt = Number(Number(h.sgstAmount).toFixed(2));
    }
    entry.csamt = Number(h.cessAmount.toFixed(2));
    return entry;
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
    // Table 3.2 → inter_sup (inter-state supplies to unregistered/composition/UIN)
    const unreg = data.table32.reduce(
      (acc, e) => ({ txval: acc.txval + e.taxableValue, iamt: acc.iamt + e.igst }),
      { txval: 0, iamt: 0 },
    );

    return {
      gstin,
      ret_period: period,
      sup_details: {
        osup_det: {
          txval: data.table31.outwardTaxableInterState.taxableValue + data.table31.outwardTaxableIntraState.taxableValue,
          iamt: data.table31.outwardTaxableInterState.igst,
          camt: data.table31.outwardTaxableIntraState.cgst,
          samt: data.table31.outwardTaxableIntraState.sgst,
          csamt: (data.table31.outwardTaxableInterState.cess ?? 0) + (data.table31.outwardTaxableIntraState.cess ?? 0),
        },
        osup_zero: {
          txval: data.table31.zeroRatedSupplies.taxableValue,
          iamt: data.table31.zeroRatedSupplies.igst,
          csamt: data.table31.zeroRatedSupplies.cess ?? 0,
        },
        osup_nil_exmp: { txval: data.table31.nilRatedExempt.taxableValue },
        osup_nongst: { txval: data.table31.nonGstOutward.taxableValue },
        // Table 3.1(d): Inward supplies liable to reverse charge
        isup_rev: {
          txval: 0,
          iamt: data.table4.itcAvailable.inwardReverseCharge.igst,
          camt: data.table4.itcAvailable.inwardReverseCharge.cgst,
          samt: data.table4.itcAvailable.inwardReverseCharge.sgst,
          csamt: data.table4.itcAvailable.inwardReverseCharge.cess,
        },
      },
      // Table 3.2: Inter-state supplies
      inter_sup: {
        unreg_details: [{ txval: unreg.txval, iamt: unreg.iamt, pos: '' }],
        comp_details: [],
        uin_details: [],
      },
      itc_elg: {
        itc_avl: [
          { ty: 'IMPG', iamt: data.table4.itcAvailable.importGoods.igst, camt: data.table4.itcAvailable.importGoods.cgst, samt: data.table4.itcAvailable.importGoods.sgst, csamt: data.table4.itcAvailable.importGoods.cess },
          { ty: 'IMPS', iamt: data.table4.itcAvailable.importServices.igst, camt: data.table4.itcAvailable.importServices.cgst, samt: data.table4.itcAvailable.importServices.sgst, csamt: data.table4.itcAvailable.importServices.cess },
          { ty: 'ISRC', iamt: data.table4.itcAvailable.inwardReverseCharge.igst, camt: data.table4.itcAvailable.inwardReverseCharge.cgst, samt: data.table4.itcAvailable.inwardReverseCharge.sgst, csamt: data.table4.itcAvailable.inwardReverseCharge.cess },
          { ty: 'ISD', iamt: data.table4.itcAvailable.isd.igst, camt: data.table4.itcAvailable.isd.cgst, samt: data.table4.itcAvailable.isd.sgst, csamt: data.table4.itcAvailable.isd.cess },
          { ty: 'OTH', iamt: data.table4.itcAvailable.allOtherItc.igst, camt: data.table4.itcAvailable.allOtherItc.cgst, samt: data.table4.itcAvailable.allOtherItc.sgst, csamt: data.table4.itcAvailable.allOtherItc.cess },
        ],
        itc_rev: [
          { ty: 'RUL', iamt: data.table4.itcReversed.rule4243.igst, camt: data.table4.itcReversed.rule4243.cgst, samt: data.table4.itcReversed.rule4243.sgst, csamt: data.table4.itcReversed.rule4243.cess },
          { ty: 'OTH', iamt: data.table4.itcReversed.others.igst, camt: data.table4.itcReversed.others.cgst, samt: data.table4.itcReversed.others.sgst, csamt: data.table4.itcReversed.others.cess },
        ],
        itc_net: { iamt: data.table4.netItc.igst, camt: data.table4.netItc.cgst, samt: data.table4.netItc.sgst, csamt: data.table4.netItc.cess },
      },
      // Table 5: Exempt, nil-rated, non-GST inward supplies
      inward_sup: {
        isup_details: [
          {
            ty: 'ISRC',
            inter: data.table5.interState.nilRated + data.table5.interState.exempt + data.table5.interState.nonGst,
            intra: data.table5.intraState.nilRated + data.table5.intraState.exempt + data.table5.intraState.nonGst,
          },
        ],
      },
      // Table 5.1: Interest and late fee
      intr_ltfee: {
        intr_details: {
          iamt: 0, camt: 0, samt: 0, csamt: 0,
        },
        ltfee_details: {
          iamt: 0, camt: data.table51.lateFee / 2, samt: data.table51.lateFee / 2, csamt: 0,
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
