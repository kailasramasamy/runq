/**
 * Indian state/UT codes as per GST (2-digit codes from GSTN).
 * Used for place of supply determination and GSTIN validation.
 */
export const INDIAN_STATES: Record<string, string> = {
  '01': 'Jammu & Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '11': 'Sikkim',
  '12': 'Arunachal Pradesh',
  '13': 'Nagaland',
  '14': 'Manipur',
  '15': 'Mizoram',
  '16': 'Tripura',
  '17': 'Meghalaya',
  '18': 'Assam',
  '19': 'West Bengal',
  '20': 'Jharkhand',
  '21': 'Odisha',
  '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',
  '24': 'Gujarat',
  '25': 'Daman & Diu',
  '26': 'Dadra & Nagar Haveli',
  '27': 'Maharashtra',
  '28': 'Andhra Pradesh',
  '29': 'Karnataka',
  '30': 'Goa',
  '31': 'Lakshadweep',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '34': 'Puducherry',
  '35': 'Andaman & Nicobar Islands',
  '36': 'Telangana',
  '37': 'Andhra Pradesh (New)',
  '38': 'Ladakh',
};

/** Reverse lookup: state name (lowercase) → 2-digit code */
const STATE_NAME_TO_CODE: Record<string, string> = {};
for (const [code, name] of Object.entries(INDIAN_STATES)) {
  STATE_NAME_TO_CODE[name.toLowerCase()] = code;
}

export function getStateCode(stateName: string): string | null {
  return STATE_NAME_TO_CODE[stateName.toLowerCase()] ?? null;
}

export function getStateName(stateCode: string): string | null {
  return INDIAN_STATES[stateCode] ?? null;
}

export function getStateOptions(): Array<{ code: string; name: string }> {
  return Object.entries(INDIAN_STATES).map(([code, name]) => ({ code, name }));
}
