#!/usr/bin/env Rscript
# Trend statistics for Vanitas usage analytics — BASE R ONLY (no CRAN packages).
#
# Input : CSV on stdin with columns `bucket,count` (bucket = ISO label).
# Output: flat `key=value` lines that services/analytics/app/rbridge.py turns
#         into JSON. Base R has no JSON writer, and adding jsonlite would make
#         the service depend on a package download at build time.
#
# Run manually:
#   printf 'bucket,count\n2026-10-03T20,12\n2026-10-03T21,30\n' | Rscript stats/trend.R

args <- commandArgs(trailingOnly = FALSE)
csv_text <- paste(readLines(file("stdin", open = "r"), warn = FALSE), collapse = "\n")

lines <- strsplit(csv_text, "\n", fixed = TRUE)[[1]]
lines <- lines[nzchar(lines)]
if (length(lines) < 2) {
  cat("error=empty input\n")
  quit(status = 0)
}

header <- strsplit(lines[1], ",", fixed = TRUE)[[1]]
body <- lines[-1]
buckets <- character(length(body))
counts <- numeric(length(body))
for (i in seq_along(body)) {
  fields <- strsplit(body[i], ",", fixed = TRUE)[[1]]
  buckets[i] <- fields[1]
  counts[i] <- as.numeric(fields[2])
}

n <- length(counts)
index <- seq_len(n)

# Least-squares trend line (identical model to the Python fallback).
model <- lm(counts ~ index)
slope <- unname(coef(model)[2])
intercept <- unname(coef(model)[1])
r2 <- summary(model)$r.squared
if (is.nan(r2)) r2 <- 0

# Trailing moving average (window = 3, early points average what exists).
ma <- sapply(index, function(i) mean(counts[max(1, i - 2):i]))

peak <- if (max(counts) > 0) buckets[which.max(counts)] else ""

# Outliers: |z| >= 2.5 (same threshold as the Python fallback).
sd_counts <- sd(counts)
if (is.na(sd_counts) || sd_counts == 0) {
  outlier_idx <- integer(0)
} else {
  z <- (counts - mean(counts)) / sd_counts
  outlier_idx <- which(abs(z) >= 2.5)
}

cat(sprintf("slope=%.4f\n", slope))
cat(sprintf("intercept=%.4f\n", intercept))
cat(sprintf("r2=%.4f\n", if (is.nan(r2)) 0 else r2))
cat(sprintf("ma=%s\n", paste(sprintf("%.2f", ma), collapse = ",")))
cat(sprintf("peak=%s\n", peak))
cat(sprintf("outliers=%s\n", paste(buckets[outlier_idx], collapse = ",")))
