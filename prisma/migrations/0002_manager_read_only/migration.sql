-- تصحيح علي (2026-11-13): السفير بيعمل كل شي، والمسؤول بيشوف للقراءة بس.
-- الاسم ADMIN كان يوحي بصلاحيات، فصار MANAGER.
ALTER TYPE "Role" RENAME VALUE 'ADMIN' TO 'MANAGER';
