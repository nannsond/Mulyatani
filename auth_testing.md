# Auth Testing
- Login: POST /api/auth/login {email,password} → {token,user}; use Authorization: Bearer <token>
- Me: GET /api/auth/me
- Change password: POST /api/auth/change-password {current_password,new_password} (auth required)
  - 400 "Password lama salah" | "Password baru minimal 6 karakter" | "Password baru harus berbeda dari password lama"
- Seed never overwrites an existing admin password (changed password survives restart).
- Verify bcrypt hash in db.users starts with $2b$.
