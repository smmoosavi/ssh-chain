/**
 * Tests for shouldUseDirect domain matching function
 */

import { describe, expect, test } from "bun:test";
import { shouldUseDirect } from "../src/proxy-server.ts";

describe("shouldUseDirect", () => {
  const directDomains = [
    "*.example.com",
    "foo-bar",
    "*.us",
    "specific.domain.org",
    "*.local",
  ];

  describe("wildcard subdomain matching (*.example.com)", () => {
    test("matches subdomain", () => {
      expect(shouldUseDirect("sub.example.com", directDomains)).toBe(true);
    });

    test("matches nested subdomain", () => {
      expect(shouldUseDirect("deep.sub.example.com", directDomains)).toBe(true);
    });

    test("matches apex domain", () => {
      expect(shouldUseDirect("example.com", directDomains)).toBe(true);
    });

    test("does not match different domain", () => {
      expect(shouldUseDirect("example.org", directDomains)).toBe(false);
    });

    test("does not match partial domain name", () => {
      expect(shouldUseDirect("notexample.com", directDomains)).toBe(false);
    });
  });

  describe("exact hostname matching (foo-bar)", () => {
    test("matches exact hostname", () => {
      expect(shouldUseDirect("foo-bar", directDomains)).toBe(true);
    });

    test("does not match partial hostname", () => {
      expect(shouldUseDirect("foo-bar-baz", directDomains)).toBe(false);
    });

    test("does not match hostname with TLD", () => {
      expect(shouldUseDirect("foo-bar.com", directDomains)).toBe(false);
    });
  });

  describe("TLD wildcard matching (*.us)", () => {
    test("matches .us domain", () => {
      expect(shouldUseDirect("example.us", directDomains)).toBe(true);
    });

    test("matches subdomain of .us", () => {
      expect(shouldUseDirect("sub.example.us", directDomains)).toBe(true);
    });

    test("does not match non-.us domain", () => {
      expect(shouldUseDirect("example.uk", directDomains)).toBe(false);
    });
  });

  describe("exact domain matching (specific.domain.org)", () => {
    test("matches exact domain", () => {
      expect(shouldUseDirect("specific.domain.org", directDomains)).toBe(true);
    });

    test("does not match subdomain of exact domain", () => {
      expect(shouldUseDirect("sub.specific.domain.org", directDomains)).toBe(false);
    });
  });

  describe("*.local pattern", () => {
    test("matches .local domain", () => {
      expect(shouldUseDirect("myhost.local", directDomains)).toBe(true);
    });

    test("matches nested .local domain", () => {
      expect(shouldUseDirect("sub.myhost.local", directDomains)).toBe(true);
    });
  });

  describe("edge cases", () => {
    test("empty directDomains returns false", () => {
      expect(shouldUseDirect("anything.com", [])).toBe(false);
    });

    test("localhost with localhost pattern", () => {
      expect(shouldUseDirect("localhost", ["localhost"])).toBe(true);
    });

    test("IP address does not match domain patterns", () => {
      expect(shouldUseDirect("192.168.1.1", directDomains)).toBe(false);
    });

    test("empty hostname returns false", () => {
      expect(shouldUseDirect("", directDomains)).toBe(false);
    });
  });
});
