
#!/bin/bash

# Script to extract Info.plist from a built .app or .ipa after building
# Usage: ./scripts/extract-plist-after-build.sh [path-to-ipa-or-app]

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}📦 EXTRACT INFO.PLIST FROM BUILT APP${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}\n"

# Check if path provided
if [ -z "$1" ]; then
  echo -e "${RED}❌ ERROR: No path provided${NC}"
  echo -e "${YELLOW}Usage: $0 <path-to-ipa-or-app>${NC}"
  echo -e "${YELLOW}Example: $0 ~/Downloads/SeaTimeTracker.ipa${NC}"
  exit 1
fi

BUILD_PATH="$1"

# Check if file exists
if [ ! -e "$BUILD_PATH" ]; then
  echo -e "${RED}❌ ERROR: File not found: $BUILD_PATH${NC}"
  exit 1
fi

# Determine file type
if [[ "$BUILD_PATH" == *.ipa ]]; then
  echo -e "${CYAN}📱 Detected IPA file${NC}"
  
  # Create temp directory
  TEMP_DIR=$(mktemp -d)
  echo -e "${CYAN}📂 Extracting IPA to: $TEMP_DIR${NC}"
  
  # Unzip IPA
  unzip -q "$BUILD_PATH" -d "$TEMP_DIR"
  
  # Find .app bundle
  APP_BUNDLE=$(find "$TEMP_DIR/Payload" -name "*.app" -maxdepth 1 | head -n 1)
  
  if [ -z "$APP_BUNDLE" ]; then
    echo -e "${RED}❌ ERROR: No .app bundle found in IPA${NC}"
    rm -rf "$TEMP_DIR"
    exit 1
  fi
  
  PLIST_PATH="$APP_BUNDLE/Info.plist"
  
elif [[ "$BUILD_PATH" == *.app ]]; then
  echo -e "${CYAN}📱 Detected .app bundle${NC}"
  PLIST_PATH="$BUILD_PATH/Info.plist"
  
else
  echo -e "${RED}❌ ERROR: Unsupported file type${NC}"
  echo -e "${YELLOW}Expected .ipa or .app${NC}"
  exit 1
fi

# Check if Info.plist exists
if [ ! -f "$PLIST_PATH" ]; then
  echo -e "${RED}❌ ERROR: Info.plist not found at: $PLIST_PATH${NC}"
  [ -n "$TEMP_DIR" ] && rm -rf "$TEMP_DIR"
  exit 1
fi

echo -e "${GREEN}✅ Found Info.plist${NC}\n"

# Extract CFBundleURLTypes section
echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}📋 CFBundleURLTypes Section:${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}\n"

# Use plutil to convert to XML and extract URL types
if command -v plutil &> /dev/null; then
  # Convert to XML format
  TEMP_XML=$(mktemp)
  plutil -convert xml1 "$PLIST_PATH" -o "$TEMP_XML"
  
  # Extract CFBundleURLTypes section
  if grep -q "CFBundleURLTypes" "$TEMP_XML"; then
    # Extract the section between CFBundleURLTypes tags
    sed -n '/<key>CFBundleURLTypes<\/key>/,/<\/array>/p' "$TEMP_XML"
    
    # Extract just the scheme values
    echo -e "\n${CYAN}═══════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}🔍 Extracted URL Schemes:${NC}"
    echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}\n"
    
    SCHEMES=$(sed -n '/<key>CFBundleURLSchemes<\/key>/,/<\/array>/p' "$TEMP_XML" | grep -o '<string>[^<]*</string>' | sed 's/<[^>]*>//g')
    
    if [ -z "$SCHEMES" ]; then
      echo -e "${RED}❌ No URL schemes found${NC}"
    else
      echo "$SCHEMES" | while read -r scheme; do
        if [[ "$scheme" == *" "* ]]; then
          echo -e "${RED}❌ INVALID: \"$scheme\" (contains spaces)${NC}"
        elif [[ "$scheme" == "SeaTime Tracker" ]]; then
          echo -e "${RED}❌ OLD SCHEME DETECTED: \"$scheme\"${NC}"
        else
          echo -e "${GREEN}✅ VALID: \"$scheme\"${NC}"
        fi
      done
    fi
  else
    echo -e "${RED}❌ CFBundleURLTypes not found in Info.plist${NC}"
  fi
  
  rm "$TEMP_XML"
else
  echo -e "${YELLOW}⚠️  plutil not found, showing raw plist${NC}"
  cat "$PLIST_PATH"
fi

echo -e "\n${CYAN}═══════════════════════════════════════════════════════${NC}\n"

# Cleanup
[ -n "$TEMP_DIR" ] && rm -rf "$TEMP_DIR"

echo -e "${GREEN}✅ Extraction complete${NC}\n"
