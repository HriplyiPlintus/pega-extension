# Pega Extension — task runner
# Usage: just <recipe>

# Show available recipes
default:
    @just --list

# Create a zip without changing the version
build:
    bash build.sh

# Bump patch version (carries over to minor/major at 99) then build and open output folder
release:
    bash build.sh --bump
    open ..

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