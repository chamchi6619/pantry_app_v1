"""
Gemini Diagnostic Endpoint
Test and debug Gemini API configuration
"""

import os
import logging
from fastapi import APIRouter, HTTPException
from typing import Dict, List, Any

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/gemini", tags=["gemini-test"])


@router.get("/diagnose")
async def diagnose_gemini() -> Dict:
    """
    Diagnose Gemini configuration and test available models
    """
    import google.generativeai as genai

    results = {
        "api_key_configured": False,
        "api_key_prefix": None,
        "available_models": [],
        "model_tests": {},
        "errors": []
    }

    # Check API key
    api_key = os.getenv('GEMINI_API_KEY')
    if api_key:
        results["api_key_configured"] = True
        results["api_key_prefix"] = api_key[:8] + "..." + api_key[-4:]

        try:
            # Configure API
            genai.configure(api_key=api_key)

            # List available models
            try:
                models = genai.list_models()
                for model in models:
                    model_info = {
                        "name": model.name,
                        "display_name": getattr(model, 'display_name', 'N/A'),
                        "description": getattr(model, 'description', 'N/A'),
                        "supported_methods": list(model.supported_generation_methods) if hasattr(model, 'supported_generation_methods') else []
                    }
                    results["available_models"].append(model_info)

                    # Extract just the model ID for testing
                    model_id = model.name.split('/')[-1] if '/' in model.name else model.name

                    # Test each model that supports generateContent
                    if 'generateContent' in model_info.get('supported_methods', []):
                        test_result = await test_model(model_id)
                        results["model_tests"][model_id] = test_result

            except Exception as e:
                results["errors"].append(f"Error listing models: {str(e)}")

                # Fallback: Try known model names
                known_models = [
                    'gemini-2.0-flash',        # Stable 2.0 Flash (recommended)
                    'gemini-2.0-flash-exp',    # Experimental 2.0
                    'gemini-1.5-flash',
                    'gemini-1.5-flash-latest',
                    'gemini-1.5-flash-8b',
                    'gemini-1.5-pro',
                    'gemini-pro'
                ]

                results["errors"].append(f"Trying known models: {known_models}")

                for model_name in known_models:
                    test_result = await test_model(model_name)
                    if test_result["success"]:
                        results["model_tests"][model_name] = test_result
                        results["available_models"].append({"name": model_name, "tested": True})

        except Exception as e:
            results["errors"].append(f"Configuration error: {str(e)}")
    else:
        results["errors"].append("No GEMINI_API_KEY found in environment")

    return results


async def test_model(model_name: str) -> Dict:
    """
    Test a specific model with simple and receipt prompts
    """
    import google.generativeai as genai
    from google.generativeai.types import HarmCategory, HarmBlockThreshold

    result = {
        "model": model_name,
        "success": False,
        "simple_test": None,
        "json_test": None,
        "receipt_test": None,
        "errors": []
    }

    try:
        # Initialize model
        model = genai.GenerativeModel(model_name)

        # Safety settings for testing
        safety_settings = [
            {
                "category": HarmCategory.HARM_CATEGORY_HARASSMENT,
                "threshold": HarmBlockThreshold.BLOCK_NONE,
            },
            {
                "category": HarmCategory.HARM_CATEGORY_HATE_SPEECH,
                "threshold": HarmBlockThreshold.BLOCK_NONE,
            },
            {
                "category": HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
                "threshold": HarmBlockThreshold.BLOCK_NONE,
            },
            {
                "category": HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
                "threshold": HarmBlockThreshold.BLOCK_NONE,
            },
        ]

        # Test 1: Simple generation
        try:
            response = model.generate_content(
                "Say 'Hello World' and nothing else.",
                generation_config={"temperature": 0.1, "max_output_tokens": 20},
                safety_settings=safety_settings
            )

            # Try different ways to get text
            text = None
            finish_reason = None

            if hasattr(response, 'text'):
                try:
                    text = response.text
                except Exception as e:
                    result["errors"].append(f"response.text failed: {e}")

            if not text and hasattr(response, 'candidates'):
                if response.candidates and len(response.candidates) > 0:
                    candidate = response.candidates[0]
                    finish_reason = getattr(candidate, 'finish_reason', None)

                    if hasattr(candidate, 'content') and hasattr(candidate.content, 'parts'):
                        if candidate.content.parts:
                            text = candidate.content.parts[0].text

            result["simple_test"] = {
                "success": bool(text),
                "response": text,
                "finish_reason": str(finish_reason) if finish_reason else None
            }

        except Exception as e:
            result["simple_test"] = {"success": False, "error": str(e)}

        # Test 2: JSON generation
        try:
            json_prompt = 'Generate JSON: {"message": "test", "number": 123}'
            response = model.generate_content(
                json_prompt,
                generation_config={"temperature": 0.1, "max_output_tokens": 100},
                safety_settings=safety_settings
            )

            text = None
            if hasattr(response, 'text'):
                try:
                    text = response.text
                except:
                    if response.candidates and response.candidates[0].content.parts:
                        text = response.candidates[0].content.parts[0].text

            result["json_test"] = {
                "success": bool(text),
                "response": text[:200] if text else None
            }

        except Exception as e:
            result["json_test"] = {"success": False, "error": str(e)}

        # Test 3: Receipt-like content
        try:
            receipt_prompt = """Parse: WALMART MILK 3.99 BREAD 2.49 TOTAL 6.48
Return merchant and total as JSON."""

            response = model.generate_content(
                receipt_prompt,
                generation_config={"temperature": 0.1, "max_output_tokens": 200},
                safety_settings=safety_settings
            )

            text = None
            finish_reason = None

            if hasattr(response, 'text'):
                try:
                    text = response.text
                except Exception as e:
                    if response.candidates:
                        finish_reason = response.candidates[0].finish_reason
                        if response.candidates[0].content.parts:
                            text = response.candidates[0].content.parts[0].text

            result["receipt_test"] = {
                "success": bool(text),
                "response": text[:200] if text else None,
                "finish_reason": str(finish_reason) if finish_reason else None
            }

        except Exception as e:
            result["receipt_test"] = {"success": False, "error": str(e)}

        # Mark overall success if any test passed
        result["success"] = any([
            result["simple_test"].get("success"),
            result["json_test"].get("success"),
            result["receipt_test"].get("success")
        ])

    except Exception as e:
        result["errors"].append(f"Model initialization failed: {str(e)}")

    return result


@router.get("/test-receipt")
async def test_receipt_parsing() -> Dict:
    """
    Test receipt parsing with a simple example
    """
    import google.generativeai as genai
    from google.generativeai.types import HarmCategory, HarmBlockThreshold

    api_key = os.getenv('GEMINI_API_KEY')
    if not api_key:
        raise HTTPException(status_code=500, detail="No API key configured")

    genai.configure(api_key=api_key)

    # Test receipt
    test_receipt = """WALMART
123 MAIN ST
ATLANTA GA 30301

MILK 2% GAL          3.99
BREAD WHEAT         2.49
EGGS LARGE DOZ      4.99

SUBTOTAL           11.47
TAX                 0.80
TOTAL              12.27"""

    # Try with the first working model from known list
    models_to_try = ['gemini-2.0-flash', 'gemini-2.0-flash-exp', 'gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-pro']

    for model_name in models_to_try:
        try:
            model = genai.GenerativeModel(model_name)

            prompt = f"""Extract data from this receipt and return JSON:
{test_receipt}

Return: {{"merchant": "...", "total": 0.00, "items": [...]}}"""

            response = model.generate_content(
                prompt,
                generation_config={"temperature": 0.1},
                safety_settings=[
                    {
                        "category": HarmCategory.HARM_CATEGORY_HARASSMENT,
                        "threshold": HarmBlockThreshold.BLOCK_NONE,
                    },
                    {
                        "category": HarmCategory.HARM_CATEGORY_HATE_SPEECH,
                        "threshold": HarmBlockThreshold.BLOCK_NONE,
                    },
                    {
                        "category": HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
                        "threshold": HarmBlockThreshold.BLOCK_NONE,
                    },
                    {
                        "category": HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
                        "threshold": HarmBlockThreshold.BLOCK_NONE,
                    },
                ]
            )

            # Extract text
            text = None
            if hasattr(response, 'text'):
                try:
                    text = response.text
                except:
                    if response.candidates and response.candidates[0].content.parts:
                        text = response.candidates[0].content.parts[0].text

            if text:
                return {
                    "success": True,
                    "model_used": model_name,
                    "response": text,
                    "parsed": try_parse_json(text)
                }

        except Exception as e:
            logger.warning(f"Model {model_name} failed: {e}")
            continue

    return {
        "success": False,
        "error": "No models could process the receipt"
    }


def try_parse_json(text: str) -> Any:
    """Try to extract and parse JSON from text"""
    import json
    import re

    # Try direct parse
    try:
        return json.loads(text)
    except:
        pass

    # Try to find JSON in text
    json_patterns = [
        r'\{[^{}]*\}',  # Simple JSON object
        r'\{.*\}',       # Any JSON object
        r'```json\s*(.*?)\s*```',  # Markdown code block
        r'```\s*(.*?)\s*```',       # Generic code block
    ]

    for pattern in json_patterns:
        matches = re.findall(pattern, text, re.DOTALL)
        for match in matches:
            try:
                return json.loads(match)
            except:
                continue

    return None