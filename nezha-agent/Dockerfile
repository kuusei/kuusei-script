# Use multi-platform build to avoid QEMU simulation issues
FROM alpine:latest

# Set non-interactive mode to prevent prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# Define architecture-based variables
ARG TARGETARCH
ARG VERSION
ENV AGENT_URL=https://github.com/nezhahq/agent/releases/download/${VERSION}/nezha-agent_linux_${TARGETARCH}.zip

# Install necessary dependencies
RUN apk add --no-cache \
    curl \
    wget \
    unzip \
    ca-certificates \
    uuidgen

# Create the working directory for Nezha Agent
RUN mkdir -p /usr/local/bin/nezha

WORKDIR /usr/local/bin/nezha

# Download and extract the Nezha Agent binary
RUN wget $AGENT_URL -O nezha-agent.zip && \
    unzip nezha-agent.zip && \
    chmod +x nezha-agent && \
    rm -f nezha-agent.zip

# Copy the setup configuration script
COPY setup-config.sh ./setup-config.sh
RUN chmod +x ./setup-config.sh

# Set working directory
WORKDIR /usr/local/bin/nezha

CMD ["sh", "-c", "./setup-config.sh && ./nezha-agent -c config.yml"]