import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle } from "lucide-react";
import { useAuthContext } from "../context/AuthContext";
import AadhaarVerification from "./AdharVerification";
import { getApiBase, parseResponseJson } from "../lib/api";

const API_BASE = getApiBase();

interface ProfileData {
  name: string;
  email: string;
  phone: string;
  aadhaarNumber: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  occupation: string;
  gender: string;
  dateOfBirth: string;
}

const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
  "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka",
  "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya",
  "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim",
  "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand",
  "West Bengal", "Delhi", "Jammu and Kashmir", "Ladakh", "Puducherry",
];

const OCCUPATIONS = [
  "Student", "Software Engineer", "Teacher", "Doctor", "Nurse", "Lawyer",
  "Business Owner", "Manager", "Sales Executive", "Accountant", "Engineer",
  "Consultant", "Designer", "Writer", "Artist", "Farmer",
  "Government Employee", "Retired", "Unemployed", "Other",
];

/** Must live outside ProfileForm — defining these inside remounts inputs on every keystroke. */
function InputField({
  label,
  name,
  type = "text",
  placeholder = "",
  value,
  onChange,
  readOnly,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  readOnly?: boolean;
}) {
  return (
    <div>
      <label className="block text-gray-700 text-sm font-semibold mb-2">{label}</label>
      <input
        name={name}
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        readOnly={readOnly}
        className="w-full px-4 py-3 rounded-lg border-2 border-orange-200 focus:border-orange-500 focus:ring focus:ring-orange-200 focus:outline-none transition-colors duration-200"
      />
    </div>
  );
}

function SelectField({
  label,
  name,
  value,
  onChange,
  options,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  options: Array<{ value: string; label: string; disabled?: boolean }>;
}) {
  return (
    <div>
      <label className="block text-gray-700 text-sm font-semibold mb-2">{label}</label>
      <select
        name={name}
        value={value}
        onChange={onChange}
        className="w-full px-4 py-3 rounded-lg border-2 border-orange-200 focus:border-orange-500 focus:ring focus:ring-orange-200 focus:outline-none transition-colors duration-200 bg-white"
      >
        {options.map((opt) => (
          <option key={opt.value || opt.label} value={opt.value} disabled={opt.disabled}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function FileUploader({
  label,
  onFileSelect,
  selectedFile,
}: {
  label: string;
  onFileSelect: (f: File | null) => void;
  selectedFile: File | null;
}) {
  return (
    <div>
      <label className="block text-gray-700 text-sm font-semibold mb-2">
        {label}
        <span className="text-gray-500 font-normal ml-1 text-xs">(Optional)</span>
      </label>
      <input
        type="file"
        onChange={(e) => onFileSelect(e.target.files?.[0] || null)}
        className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-orange-50 file:text-orange-700 hover:file:bg-orange-100 transition-colors duration-200"
      />
      {selectedFile && (
        <span className="text-sm text-green-600 mt-1 flex items-center gap-1">
          <CheckCircle className="w-4 h-4" /> {selectedFile.name}
        </span>
      )}
    </div>
  );
}

function validateAadhaar(aadhaar: string): boolean {
  const clean = aadhaar.replace(/[\s-]/g, "");
  if (!/^\d{12}$/.test(clean)) return false;
  const d = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
    [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
    [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
    [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
    [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
    [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
    [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
    [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
    [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
  ];
  const p = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
    [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
    [8, 9, 1, 6, 0, 4, 3, 6, 2, 7],
    [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
    [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
    [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
    [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
  ];
  let c = 0;
  const rev = clean.split("").map(Number).reverse();
  for (let i = 0; i < rev.length; i++) c = d[c][p[i % 8][rev[i]]];
  return c === 0;
}

const cleanAadhaarNumber = (v: string) => v.replace(/\D/g, "").substring(0, 12);
const formatAadhaarDisplay = (v: string) =>
  cleanAadhaarNumber(v).replace(/(\d{4})(\d{4})(\d{4})/, "$1 $2 $3");

const ProfileForm: React.FC = () => {
  const { user } = useAuthContext();
  const navigate = useNavigate();

  const [profile, setProfile] = useState<ProfileData>({
    name: user?.name || "",
    email: user?.email || "",
    phone: "",
    aadhaarNumber: "",
    address: "",
    city: "",
    state: "",
    pincode: "",
    occupation: "",
    gender: "",
    dateOfBirth: "",
  });

  const [utilityBill, setUtilityBill] = useState<File | null>(null);
  const [salarySlip, setSalarySlip] = useState<File | null>(null);
  const [aadhaarFrontImage, setAadhaarFrontImage] = useState<string | null>(null);
  const [aadhaarBackImage, setAadhaarBackImage] = useState<string | null>(null);
  const [fetching, setFetching] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [isValidAadhaar, setIsValidAadhaar] = useState<boolean | null>(null);
  const [aadhaarError, setAadhaarError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  // Load existing profile once per user id (do not depend on whole user object identity)
  useEffect(() => {
    if (!user?.id) {
      setFetching(false);
      return;
    }

    let cancelled = false;

    const fetchProfile = async () => {
      try {
        const res = await fetch(`${API_BASE}/profile?user_id=${user.id}`);
        const data = await parseResponseJson<{
          has_profile?: boolean;
          profile?: Record<string, string>;
        }>(res);
        if (cancelled) return;
        if (data?.has_profile && data.profile) {
          setProfile((prev) => ({
            ...prev,
            name: data.profile.name || user.name || "",
            email: data.profile.email || user.email || "",
            phone: data.profile.phone || "",
            gender: data.profile.gender || "",
            state: data.profile.state || "",
            occupation: data.profile.occupation || "",
            aadhaarNumber: data.profile.aadhaar_number || "",
            address: data.profile.address || "",
            city: data.profile.city || "",
            pincode: data.profile.pincode || "",
            dateOfBirth: data.profile.date_of_birth || "",
          }));
        }
      } catch (err) {
        console.error("Error fetching profile:", err);
      } finally {
        if (!cancelled) setFetching(false);
      }
    };

    fetchProfile();
    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.name, user?.email]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      const { name, value } = e.target;
      setProfile((prev) => ({ ...prev, [name]: value }));
    },
    []
  );

  const handleAadhaarExtracted = useCallback(
    (extractedAadhaar: string, extractedData?: Record<string, string>) => {
      const cleaned = cleanAadhaarNumber(extractedAadhaar);
      if (cleaned.length === 12) {
        const updates: Partial<ProfileData> = { aadhaarNumber: cleaned };
        if (extractedData?.name) updates.name = extractedData.name;
        if (extractedData?.address) {
          updates.address = extractedData.address;
          const pinMatch = extractedData.address.match(/\b\d{6}\b/);
          if (pinMatch) updates.pincode = pinMatch[0];
          const foundState = INDIAN_STATES.find((s) =>
            extractedData.address!.toLowerCase().includes(s.toLowerCase())
          );
          if (foundState) updates.state = foundState;
        }
        setProfile((prev) => ({ ...prev, ...updates }));
        const valid = validateAadhaar(cleaned);
        setIsValidAadhaar(valid);
        setAadhaarError(valid ? "" : "Invalid Aadhaar number. Please verify.");
      } else if (cleaned.length > 0) {
        setAadhaarError(`Incomplete Aadhaar extracted (${cleaned.length} digits).`);
        setIsValidAadhaar(false);
      }
    },
    []
  );

  const handleAadhaarChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const cleaned = cleanAadhaarNumber(e.target.value);
    setProfile((prev) => ({ ...prev, aadhaarNumber: cleaned }));
    if (cleaned.length === 12) {
      const valid = validateAadhaar(cleaned);
      setIsValidAadhaar(valid);
      setAadhaarError(valid ? "" : "Invalid Aadhaar number");
    } else {
      setIsValidAadhaar(null);
      setAadhaarError(cleaned.length > 0 ? "Aadhaar number must be 12 digits" : "");
    }
  }, []);

  const handleImagesReady = useCallback((front: string | null, back: string | null) => {
    if (front) setAadhaarFrontImage(front);
    if (back) setAadhaarBackImage(back);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) {
      setSubmitError("Not authenticated. Please sign in again.");
      return;
    }
    setIsSubmitting(true);
    setSubmitError("");

    try {
      const res = await fetch(`${API_BASE}/profile`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user.token}`,
        },
        body: JSON.stringify({
          user_id: user.id,
          name: profile.name,
          gender: profile.gender,
          state: profile.state,
          occupation: profile.occupation,
          email: profile.email || undefined,
          phone: profile.phone || undefined,
          aadhaar_number: profile.aadhaarNumber || undefined,
          address: profile.address || undefined,
          city: profile.city || undefined,
          pincode: profile.pincode || undefined,
          date_of_birth: profile.dateOfBirth || undefined,
          aadhaar_front_image: aadhaarFrontImage || undefined,
          aadhaar_back_image: aadhaarBackImage || undefined,
        }),
      });

      // Only parse JSON when a body is present (handles 204 / empty / non-JSON).
      const data = await parseResponseJson<{
        success?: boolean;
        message?: string;
        detail?: string | { msg?: string }[];
        user?: unknown;
      }>(res);

      if (res.ok && (data.success !== false)) {
        setSubmitted(true);
        setTimeout(() => navigate("/dashboard"), 2000);
        return;
      }

      const detail = data.detail;
      const detailMsg =
        typeof detail === "string"
          ? detail
          : Array.isArray(detail)
            ? detail.map((d) => (typeof d === "string" ? d : d?.msg)).filter(Boolean).join("; ")
            : "";
      throw new Error(detailMsg || data.message || `Failed to save profile (${res.status})`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save profile";
      setSubmitError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!user) return <p className="text-center mt-10">Please sign in to complete your profile.</p>;
  if (fetching) return <p className="text-center mt-10">Loading profile…</p>;

  return (
    <div className="max-w-2xl mx-auto bg-white shadow p-6 rounded-lg my-8">
      <h2 className="text-2xl font-bold mb-4">Complete Your Profile</h2>

      {submitted ? (
        <div className="text-center py-8">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-green-600 mb-2">
            Profile Submitted Successfully!
          </h3>
          <p className="text-gray-600">Redirecting to dashboard…</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          <AadhaarVerification
            onAadhaarExtracted={handleAadhaarExtracted}
            onImagesReady={handleImagesReady}
          />

          <div>
            <InputField
              label="Aadhaar Number"
              name="aadhaarNumber"
              value={profile.aadhaarNumber ? formatAadhaarDisplay(profile.aadhaarNumber) : ""}
              onChange={handleAadhaarChange}
              placeholder="1234 5678 9012"
            />
            {isValidAadhaar === true && (
              <p className="text-green-600 text-sm mt-1 flex items-center gap-1">
                <CheckCircle className="w-4 h-4" /> Valid Aadhaar number
              </p>
            )}
            {aadhaarError && <p className="text-red-500 text-sm mt-1">{aadhaarError}</p>}
          </div>

          <InputField
            label="Full Name"
            name="name"
            value={profile.name}
            onChange={handleChange}
            placeholder="Enter your full name"
          />
          <InputField
            label="Email"
            name="email"
            type="email"
            value={profile.email}
            onChange={handleChange}
            placeholder="Enter your email"
          />
          <InputField
            label="Phone"
            name="phone"
            type="tel"
            value={profile.phone}
            onChange={handleChange}
            placeholder="Enter your phone number"
          />
          <InputField
            label="Date of Birth"
            name="dateOfBirth"
            type="date"
            value={profile.dateOfBirth}
            onChange={handleChange}
          />

          <div>
            <label className="block text-gray-700 text-sm font-semibold mb-2">Address</label>
            <textarea
              name="address"
              value={profile.address}
              onChange={handleChange}
              placeholder="Enter your address"
              rows={3}
              className="w-full px-4 py-3 rounded-lg border-2 border-orange-200 focus:border-orange-500 focus:ring focus:ring-orange-200 focus:outline-none transition-colors duration-200"
            />
          </div>

          <InputField
            label="City"
            name="city"
            value={profile.city}
            onChange={handleChange}
            placeholder="Enter your city"
          />
          <SelectField
            label="State"
            name="state"
            value={profile.state}
            onChange={handleChange}
            options={[
              { value: "", label: "Select State", disabled: true },
              ...INDIAN_STATES.map((s) => ({ value: s, label: s })),
            ]}
          />
          <InputField
            label="PIN Code"
            name="pincode"
            value={profile.pincode}
            onChange={handleChange}
            placeholder="Enter PIN code"
          />

          <SelectField
            label="Gender"
            name="gender"
            value={profile.gender}
            onChange={handleChange}
            options={[
              { value: "", label: "Select Gender", disabled: true },
              { value: "Male", label: "Male" },
              { value: "Female", label: "Female" },
              { value: "Other", label: "Other" },
            ]}
          />
          <SelectField
            label="Occupation"
            name="occupation"
            value={profile.occupation}
            onChange={handleChange}
            options={[
              { value: "", label: "Select Occupation", disabled: true },
              ...OCCUPATIONS.map((o) => ({ value: o, label: o })),
            ]}
          />

          <h3 className="text-lg font-semibold mt-8 mb-2">Optional Documents</h3>
          <FileUploader
            label="Utility Bill"
            onFileSelect={setUtilityBill}
            selectedFile={utilityBill}
          />
          <FileUploader
            label="Salary Slip"
            onFileSelect={setSalarySlip}
            selectedFile={salarySlip}
          />

          {submitError && (
            <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-2">
              {submitError}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-orange-600 hover:bg-orange-700 disabled:bg-orange-400 text-white py-3 px-6 rounded-lg font-semibold transition-colors duration-200"
          >
            {isSubmitting ? "Saving…" : "Save Profile"}
          </button>
        </form>
      )}
    </div>
  );
};

export default ProfileForm;
