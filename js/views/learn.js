// views/learn.js — bite-sized investing lessons (list + detail)

import { LESSONS } from "../data.js";
import { escapeHtml } from "../ui.js";

export function renderLearn(outlet) {
  outlet.innerHTML = `
    <div class="reveal">
      <div class="page-head">
        <div class="eyebrow">Start here</div>
        <h1 class="page-title">Learn the <b>basics</b></h1>
        <p class="page-sub">Short, jargon-free reads to build the habits that actually compound.</p>
      </div>
      <div class="grid" style="gap:10px">
        ${LESSONS.map((l) => `
          <a class="card card-link lesson" href="lesson/${l.id}" data-link>
            <div class="lesson-ic"><i class="ph ${l.icon}"></i></div>
            <div style="flex:1">
              <h4>${l.title}</h4>
              <p>${l.summary}</p>
              <div class="meta">${l.time} read</div>
            </div>
            <i class="ph ph-arrow-right" style="font-size:18px;color:var(--text-3);align-self:center"></i>
          </a>`).join("")}
      </div>
    </div>`;
}

export function renderLesson(outlet, params) {
  const i = LESSONS.findIndex((l) => l.id === params.id);
  const l = LESSONS[i];
  if (!l) { renderLearn(outlet); return; }
  const next = LESSONS[i + 1];
  outlet.innerHTML = `
    <div class="reveal" style="max-width:640px;margin:0 auto">
      <a class="btn btn-ghost btn-sm" href="learn" data-link style="margin-bottom:18px"><i class="ph ph-arrow-left"></i> All lessons</a>
      <div class="lesson-ic" style="width:52px;height:52px;border-radius:15px;font-size:26px;margin-bottom:16px"><i class="ph ${l.icon}"></i></div>
      <h1 class="page-title" style="margin-bottom:6px">${l.title}</h1>
      <div class="eyebrow" style="margin-bottom:22px">${l.time} read</div>
      ${l.body.map((para) => `<p style="font-size:16px;line-height:1.75;color:var(--text-2);margin-bottom:16px">${escapeHtml(para)}</p>`).join("")}
      ${next ? `
        <a class="card card-pad card-link" href="lesson/${next.id}" data-link style="display:flex;align-items:center;gap:14px;margin-top:24px">
          <div class="lesson-ic"><i class="ph ${next.icon}"></i></div>
          <div style="flex:1"><div class="eyebrow">Next up</div><div style="font-weight:600;margin-top:2px">${next.title}</div></div>
          <i class="ph ph-arrow-right" style="font-size:20px;color:var(--text-3)"></i>
        </a>` : `<a class="btn btn-primary" href="picks" data-link style="margin-top:12px">Browse stock ideas <i class="ph ph-arrow-right"></i></a>`}
    </div>`;
}
