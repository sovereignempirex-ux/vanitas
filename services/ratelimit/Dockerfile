# Go rate-limit microservice — build stage compiles a static binary, the
# runtime image only contains it plus busybox (for the compose healthcheck).
FROM golang:1.27-alpine AS build
WORKDIR /src
COPY go.mod ./
COPY *.go ./
# No third-party modules ⇒ no module download, no network needed to build.
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/ratelimit .

FROM alpine:3.20
RUN apk add --no-cache ca-certificates
COPY --from=build /out/ratelimit /usr/local/bin/ratelimit
ENV RATELIMIT_HOST=0.0.0.0 \
    RATELIMIT_PORT=8300
EXPOSE 8300
USER nobody
ENTRYPOINT ["/usr/local/bin/ratelimit"]
