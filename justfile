# Pega Extension — task runner
# Usage: just <recipe>

# Show available recipes
default:
    @just --list

# Create a zip ready for Chrome Web Store submission
build:
    bash build.sh

# Format all source files with prettier
format:
    npx prettier --write .

# Install npm dependencies
install:
    npm install

# Remove previously generated zip files from parent directory
clean:
    rm -f ../pega-extension-*.zip
    @echo "Cleaned up build artifacts"

# Build and open the output directory
release: build
    open ..