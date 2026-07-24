# 🌾 CreditSetu

CreditSetu is an AI-powered credit scoring and loan recommendation platform designed to help farmers and underserved users access financial services quickly, securely, and transparently. The platform evaluates user information, financial details, and psychometric assessments to generate a transparent credit score and simplify the loan approval process.

---

# 🚀 Features

## 👤 User Module

- Secure User Registration
- Email & Password Authentication
- JWT-Based Authentication
- User Profile Management
- Psychometric Assessment
- AI-Based Credit Score Generation
- Loan Application
- Loan Status Tracking
- Personalized Dashboard

---

## 👨‍💼 Admin Module

- Secure Admin Login
- Admin Dashboard
- View All Users
- Review Loan Applications
- Approve or Reject Loans
- Manage User Information

---

# 🛠️ Tech Stack

### Frontend
- React.js
- Vite
- TypeScript
- Tailwind CSS

### Backend
- FastAPI
- Python

### Database
- MongoDB

### Authentication
- JWT (JSON Web Token)
- Bcrypt Password Hashing

---

# 📂 Project Structure

```
CreditSetu/
│
├── backend/
│   ├── app.py
│   ├── auth/
│   ├── database/
│   ├── models/
│   ├── routes/
│   └── requirements.txt
│
├── frontend/
│   └── creditsetu-ui/
│       ├── src/
│       ├── assets/
│       ├── components/
│       ├── pages/
│       └── package.json
│
└── README.md
```

---

# 🔄 Application Flow

```
Landing Page
      │
      ▼
Register / Login
      │
      ▼
Complete Profile
      │
      ▼
Psychometric Test
      │
      ▼
Dashboard
      │
      ▼
Loan Application
      │
      ▼
Application Status
      │
      ▼
Admin Login
      │
      ▼
Admin Dashboard
      │
      ▼
Loan Approval / Rejection
```

---

# 💻 Installation

## Clone Repository

```bash
git clone https://github.com/YOUR_GITHUB_USERNAME/CreditSetu.git
```

## Backend Setup

```bash
cd backend
pip install -r requirements.txt
uvicorn app:app --reload
```

Backend runs at:

```
http://localhost:8000
```

## Frontend Setup

```bash
cd frontend/creditsetu-ui
npm install
npm run dev
```

Frontend runs at:

```
http://localhost:5173
```

---

# 🔐 Environment Variables

## Backend (.env)

```env
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET_KEY=your_secret_key
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
```

## Frontend (.env)

```env
VITE_API_BASE_URL=http://localhost:8000
```

---

# 📸 Screenshots

Add screenshots of:

- Landing Page
- User Registration
- User Login
- Profile Page
- Dashboard
- Psychometric Test
- Loan Application
- Application Status
- Admin Login
- Admin Dashboard

---

# 🎯 Objectives

- Build a transparent AI-powered credit scoring platform.
- Improve financial accessibility for underserved users.
- Simplify the loan application process.
- Provide secure authentication and authorization.
- Enable efficient loan management for administrators.
- Deliver a responsive and user-friendly experience.

---

# ⭐ Key Features

- AI-Based Credit Scoring
- JWT Authentication
- Secure Password Hashing
- MongoDB Database
- FastAPI REST APIs
- Responsive User Interface
- Loan Management System
- Admin Dashboard
- Psychometric Assessment
- Real-Time Application Tracking

---

# 🚀 Future Enhancements

- AI Credit Risk Prediction
- OCR-Based Document Verification
- Email Notifications
- SMS Notifications
- Multi-language Support
- Mobile Application
- Credit History Analytics
- Bank API Integration
- Financial Insights Dashboard

---
---

# 👥 Team

CreditSetu was collaboratively designed and developed by:

| Name | GitHub |
|------|--------|
| Rudra Prajapati | [@rudra02609](https://github.com/rudra02609) |
| Have Patel | [@HavePatel](https://github.com/HavePatel) |
| Khushi Vadodariya | [@KhushiVadadoriya](https://github.com/KhushiVadadoriya) |

---

# 📄 License

This project is developed for educational and learning purposes.

© 2026 CreditSetu. All Rights Reserved. 
