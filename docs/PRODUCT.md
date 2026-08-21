# JuniorJob AI — Product Specification

## 1. Product Vision

JuniorJob AI helps junior software developers find job opportunities that are genuinely suitable for entry-level candidates.

The problem is not simply that jobs are spread across different websites.

The bigger problem is that job titles and search filters are unreliable.

A job may contain "Junior" in its title while requiring three or five years of professional experience.

JuniorJob AI should identify this difference.

---

## 2. Target User

The initial target user is:

* Junior software developer
* Recent computer science graduate
* Entry-level software engineer
* Developer with approximately 0–2 years of experience

The initial product focuses on software-development jobs.

---

## 3. Main User Problem

A user currently needs to:

1. Open multiple job websites.
2. Search each website separately.
3. Repeat similar filters.
4. Open many job descriptions.
5. Determine whether each job is genuinely junior.
6. Discover that many "junior" jobs actually require significant experience.

JuniorJob AI should reduce this work.

---

## 4. Core User Experience

The user should be able to:

1. Create an account.
2. Create a basic job-search profile.
3. Search for jobs.
4. Select relevant job preferences.
5. See jobs from supported sources.
6. See a junior suitability score.
7. Understand why the job was classified as suitable or unsuitable.
8. Filter results.
9. Open the original job posting.
10. Save interesting jobs.

---

## 5. Example Search

A user might search for:

Job:
Java Developer

Location:
Germany

Experience:
0–2 years

Workplace:
Remote or Hybrid

Technologies:
Java
Spring Boot
PostgreSQL

The system should return relevant jobs and rank/filter them based on junior suitability.

---

## 6. Junior Classification

A job should not be considered junior merely because the title contains "Junior".

The system should analyze the job description.

Examples of strong positive evidence:

* "No experience required"
* "0–1 years of experience"
* "0–2 years of experience"
* "Recent graduates welcome"
* "Entry-level position"

Examples of negative evidence:

* "3+ years of experience"
* "5+ years of experience"
* "Lead a team"
* "Senior-level responsibilities"
* "Extensive production experience"

The system should preserve evidence supporting its classification.

---

## 7. Example Result

A job could be displayed as:

Junior Java Developer

Company:
Example Company

Location:
Berlin, Germany

Junior Match:
94%

Experience:
0–1 years

Positive signals:

* 0–1 years of experience
* Recent graduates welcome
* Java and Spring Boot required

Potential concerns:

* German B2 required

The user should be able to open the original job posting.

---

## 8. Important Product Principle

The application should optimize for:

"Show me jobs I should realistically consider."

It should not optimize simply for:

"Show me as many jobs as possible."

Quality and relevance are more important than the number of results.

---

## 9. MVP Boundaries

The MVP should NOT include:

* Payments
* Subscriptions
* CV optimization
* Cover letters
* Interview preparation
* Automatic job applications
* Mobile application
* Recruiter accounts
* Company dashboards

Those features may be considered later.

---

## 10. Future Direction

After the MVP is validated, the product may evolve toward personalized career assistance.

Potential future capabilities:

* Personalized job matching
* CV-to-job matching
* Skill-gap analysis
* Job alerts
* Daily recommendations
* Application tracking
* CV improvement
* Cover-letter assistance
* Interview preparation
* SaaS subscriptions

These are future ideas and should not be implemented during the MVP unless explicitly requested.
