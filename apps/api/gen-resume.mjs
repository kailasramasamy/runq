import puppeteer from 'puppeteer';
import { writeFileSync } from 'node:fs';

const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1f2937; margin: 0; padding: 48px 56px; font-size: 12px; line-height: 1.5; }
  h1 { margin: 0; font-size: 26px; letter-spacing: 0.5px; }
  .role { color: #0f766e; font-size: 13px; font-weight: 600; margin-top: 2px; }
  .contact { color: #6b7280; font-size: 11px; margin-top: 6px; }
  h2 { font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #0f766e;
       border-bottom: 1.5px solid #0f766e; padding-bottom: 3px; margin: 22px 0 10px; }
  .job-title { font-weight: 700; font-size: 12.5px; }
  .job-meta { color: #6b7280; font-size: 11px; margin-bottom: 3px; }
  ul { margin: 4px 0 12px; padding-left: 18px; }
  li { margin-bottom: 2px; }
  .two { display: flex; justify-content: space-between; }
  .skills span { display: inline-block; background: #f0fdfa; border: 1px solid #ccfbf1;
       color: #115e59; padding: 2px 9px; border-radius: 10px; margin: 0 5px 5px 0; font-size: 11px; }
</style></head><body>

  <h1>Ramesh Yadav</h1>
  <div class="role">Production Supervisor &mdash; Automotive Components</div>
  <div class="contact">Pune, Maharashtra &nbsp;|&nbsp; +91 98220 41576 &nbsp;|&nbsp; ramesh.yadav84@gmail.com</div>

  <h2>Professional Summary</h2>
  <div>Production supervisor with 11+ years in automotive component manufacturing. Experienced
  in running CNC machine shops, leading shift teams of 20&ndash;30 operators, and driving lean
  improvements on the shop floor. Strong track record in meeting daily output targets while
  keeping rejection rates below 1.5%.</div>

  <h2>Work Experience</h2>

  <div class="two"><span class="job-title">Production Supervisor</span>
    <span class="job-meta">Jun 2018 &ndash; Present</span></div>
  <div class="job-meta">Sharma Auto Components Pvt Ltd, Chakan, Pune</div>
  <ul>
    <li>Supervise a 28-member shift producing transmission gears and shafts.</li>
    <li>Cut machine downtime 22% by introducing a preventive maintenance schedule.</li>
    <li>Coordinate daily production planning with the quality and dispatch teams.</li>
  </ul>

  <div class="two"><span class="job-title">Shift In-charge</span>
    <span class="job-meta">Mar 2014 &ndash; May 2018</span></div>
  <div class="job-meta">Bharat Forge Industries, Bhosari, Pune</div>
  <ul>
    <li>Ran the night shift CNC turning section; handled manpower allocation and output reporting.</li>
    <li>Led a 5S drive across the section that became the plant-wide standard.</li>
  </ul>

  <div class="two"><span class="job-title">CNC Machine Operator</span>
    <span class="job-meta">Aug 2011 &ndash; Feb 2014</span></div>
  <div class="job-meta">Krishna Engineering Works, Nashik</div>
  <ul>
    <li>Operated CNC lathes and VMC machines; maintained tolerances on precision components.</li>
  </ul>

  <h2>Education</h2>
  <div class="two"><span class="job-title">Diploma in Mechanical Engineering</span>
    <span class="job-meta">2011</span></div>
  <div class="job-meta">Government Polytechnic, Nashik &mdash; 68% (First Class)</div>

  <div class="two" style="margin-top:8px"><span class="job-title">S.S.C. (Class X)</span>
    <span class="job-meta">2008</span></div>
  <div class="job-meta">Maharashtra State Board &mdash; 74%</div>

  <h2>Skills</h2>
  <div class="skills">
    <span>CNC Machine Operation</span><span>Lean Manufacturing</span><span>5S</span>
    <span>Production Planning</span><span>Quality Inspection</span><span>Team Leadership</span>
    <span>Preventive Maintenance</span><span>ISO 9001</span><span>MS Excel</span><span>Tally ERP</span>
  </div>

  <h2>Certifications</h2>
  <ul>
    <li>Lean Six Sigma Green Belt &mdash; Confederation of Indian Industry (CII), 2019</li>
    <li>Forklift Operation Licence &mdash; RTO Pune, 2016</li>
  </ul>

  <h2>Languages</h2>
  <div>Hindi, Marathi, English</div>

</body></html>`;

const browser = await puppeteer.launch({ headless: 'new' });
const page = await browser.newPage();
await page.setContent(html, { waitUntil: 'networkidle0' });
const pdf = await page.pdf({ format: 'A4', printBackground: true });
await browser.close();

const out = process.argv[2] ?? 'Ramesh_Yadav_Resume.pdf';
writeFileSync(out, pdf);
console.log('wrote ' + out);
