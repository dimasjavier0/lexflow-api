# Image the API runs from in AWS Lambda (see docs/aws-deployment.md). The Express server
# starts as usual; the Lambda Web Adapter extension turns each Lambda invocation into an
# HTTP request to it, streaming the response.

FROM public.ecr.aws/docker/library/node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json prisma.config.ts ./
COPY prisma ./prisma
COPY src ./src
# Prisma's config needs a URL to generate the client; it is never used to connect.
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" npx prisma generate && npm run build
# Runtime dependencies only. npm still installs the Prisma CLI, its Studio and TypeScript as
# peers of @prisma/client; the generated client does not use them, so they leave the image.
RUN rm -rf node_modules && npm ci --omit=dev  && rm -rf node_modules/prisma node_modules/typescript node_modules/@prisma/studio-core node_modules/@prisma/dev            node_modules/@prisma/engines node_modules/@prisma/fetch-engine node_modules/@electric-sql

# Piper (text to speech) for Linux, and the two voices the API uses, pinned by checksum.
FROM public.ecr.aws/docker/library/debian:bookworm-slim AS piper
ADD --checksum=sha256:a50cb45f355b7af1f6d758c1b360717877ba0a398cc8cbe6d2a7a3a26e225992 \
    https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_x86_64.tar.gz /tmp/piper.tar.gz
RUN mkdir -p /opt && tar -xzf /tmp/piper.tar.gz -C /opt
ADD --checksum=sha256:b3a6e47b57b8c7fbe6a0ce2518161a50f59a9cdd8a50835c02cb02bdd6206c18 \
    https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/amy/medium/en_US-amy-medium.onnx /opt/voices/en_US-amy-medium.onnx
ADD https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/amy/medium/en_US-amy-medium.onnx.json /opt/voices/en_US-amy-medium.onnx.json
ADD --checksum=sha256:0a309668932205e762801f1efc2736cd4b0120329622adf62be09e56339d3330 \
    https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_GB/alan/medium/en_GB-alan-medium.onnx /opt/voices/en_GB-alan-medium.onnx
ADD https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_GB/alan/medium/en_GB-alan-medium.onnx.json /opt/voices/en_GB-alan-medium.onnx.json
# Downloaded files arrive readable only by root; Lambda runs as an unprivileged user.
RUN chmod -R a+rX /opt/voices /opt/piper

FROM public.ecr.aws/docker/library/node:22-bookworm-slim
COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:0.9.1 /lambda-adapter /opt/extensions/lambda-adapter
COPY --from=piper /opt/piper /opt/piper
COPY --from=piper /opt/voices /opt/voices
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

ENV NODE_ENV=production \
    API_PORT=8080 \
    AWS_LWA_PORT=8080 \
    AWS_LWA_READINESS_CHECK_PATH=/health \
    AWS_LWA_INVOKE_MODE=response_stream \
    PIPER_PATH=/opt/piper/piper \
    PIPER_VOICE_MODEL_US=/opt/voices/en_US-amy-medium.onnx \
    PIPER_VOICE_MODEL_UK=/opt/voices/en_GB-alan-medium.onnx

# Lambda runs the container as an unprivileged user with a read-only file system except /tmp.
USER node
CMD ["node", "dist/main.js"]
