"use client";

import { FormEvent, useState } from "react";

export function CourseCreateForm() {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");

    const formData = new FormData(event.currentTarget);

    const response = await fetch("/api/institute/courses", {
      method: "POST",
      body: formData,
    });

    const body = await response.json();
    if (!response.ok) {
      setError(body.error ?? "Failed to submit course");
      return;
    }

    setMessage(body.message ?? "Course submitted for approval");
    event.currentTarget.reset();
  }

  return (
    <form onSubmit={onSubmit} className="mt-4 grid gap-3 rounded border bg-white p-4">
      <h2 className="text-lg font-semibold">Create New Course Listing</h2>

      <input name="title" required placeholder="Course title" className="rounded border px-3 py-2" />
      <input name="summary" required placeholder="Short summary" className="rounded border px-3 py-2" />
      <textarea name="description" required placeholder="Detailed course description" className="min-h-24 rounded border px-3 py-2" />

      <div className="grid gap-3 md:grid-cols-2">
        <input name="category" required placeholder="Category (e.g. Engineering Entrance)" className="rounded border px-3 py-2" />
        <input name="subcategory" placeholder="Subcategory (e.g. JEE Main)" className="rounded border px-3 py-2" />
        <select name="courseLevel" required className="rounded border px-3 py-2">
          <option value="">Select course level</option>
          <option value="beginner">Beginner</option>
          <option value="intermediate">Intermediate</option>
          <option value="advanced">Advanced</option>
        </select>
        <input name="language" required placeholder="Language (e.g. English/Hindi)" className="rounded border px-3 py-2" />
        <select name="deliveryMode" required className="rounded border px-3 py-2">
          <option value="">Delivery mode</option>
          <option value="online_live">Online Live</option>
          <option value="online_recorded">Online Recorded</option>
          <option value="offline_classroom">Offline Classroom</option>
          <option value="hybrid">Hybrid</option>
        </select>
        <input name="feeAmount" type="number" min={0} required placeholder="Course fee amount" className="rounded border px-3 py-2" />
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <input name="durationValue" required type="number" min={1} placeholder="Duration value" className="rounded border px-3 py-2" />
        <select name="durationUnit" required className="rounded border px-3 py-2">
          <option value="">Duration unit</option>
          <option value="days">Days</option>
          <option value="weeks">Weeks</option>
          <option value="months">Months</option>
          <option value="years">Years</option>
        </select>
        <input name="weeklySchedule" required placeholder="Weekly schedule (e.g. Mon-Fri 7-9 PM)" className="rounded border px-3 py-2" />
        <input name="startDate" required type="date" className="rounded border px-3 py-2" />
        <input name="endDate" type="date" className="rounded border px-3 py-2" />
        <input name="admissionDeadline" type="date" className="rounded border px-3 py-2" />
      </div>

      <textarea name="eligibility" required placeholder="Eligibility criteria" className="min-h-20 rounded border px-3 py-2" />
      <textarea name="prerequisites" placeholder="Prerequisites" className="min-h-20 rounded border px-3 py-2" />
      <textarea name="learningOutcomes" required placeholder="Learning outcomes" className="min-h-20 rounded border px-3 py-2" />
      <textarea name="targetAudience" placeholder="Target audience" className="min-h-20 rounded border px-3 py-2" />
      <textarea name="syllabus" required placeholder="Detailed syllabus / curriculum" className="min-h-28 rounded border px-3 py-2" />

      <div className="grid gap-3 md:grid-cols-2">
        <select name="certificateAvailable" className="rounded border px-3 py-2">
          <option value="no">Certificate not available</option>
          <option value="yes">Certificate available</option>
        </select>
        <input name="certificationDetails" placeholder="Certification details" className="rounded border px-3 py-2" />
        <input name="totalSeats" type="number" min={1} placeholder="Total seats" className="rounded border px-3 py-2" />
        <input name="demoVideoUrl" placeholder="Demo video URL" className="rounded border px-3 py-2" />
        <input name="brochureUrl" placeholder="Brochure URL" className="rounded border px-3 py-2" />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <input name="instructorName" placeholder="Instructor / Faculty name" className="rounded border px-3 py-2" />
        <input name="instructorQualification" placeholder="Instructor qualification" className="rounded border px-3 py-2" />
        <input name="supportEmail" type="email" placeholder="Support email" className="rounded border px-3 py-2" />
        <input name="supportPhone" placeholder="Support phone" className="rounded border px-3 py-2" />
      </div>

      <div className="rounded border border-slate-200 bg-slate-50 p-3">
        <p className="text-sm font-medium">Course media (required)</p>
        <p className="text-xs text-slate-600">Upload multiple files and include at least 1 image and 1 video.</p>
        <input
          type="file"
          name="mediaFiles"
          multiple
          required
          accept="image/png,image/jpeg,image/webp,video/mp4"
          className="mt-2 rounded border bg-white px-3 py-2"
        />
      </div>

      <button type="submit" className="rounded bg-brand-600 px-4 py-2 text-white">
        Submit Course for Admin Approval
      </button>
      {message && <p className="text-sm text-emerald-700">{message}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
