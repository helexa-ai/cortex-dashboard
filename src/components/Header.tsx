import React from "react";
import { Link, NavLink } from "react-router-dom";
import { Navbar, Container, Nav, Button, Dropdown } from "react-bootstrap";
import { FaRegMoon, FaRegSun } from "react-icons/fa6";
import { useTheme } from "../layout/theme";
import { useTranslation } from "react-i18next";
import {
  AUTONYM_MAP,
  SUPPORTED_LANGUAGES,
  type LanguageCode,
  isRtlLanguage,
} from "../i18n/languages";

/**
 * Header
 *
 * - Top navigation bar
 * - Links:
 *   - /       -> Home
 *   - /chat   -> Chat
 *   - /docs   -> external docs (opens in new tab)
 * - Includes a theme toggle button wired to ThemeContext
 * - Includes a language selector using autonyms (language names in their own language)
 */
const Header: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const { t, i18n } = useTranslation("common");

  const handleLanguageChange = (lng: LanguageCode) => {
    void i18n.changeLanguage(lng);
  };

  const rawLanguage = i18n.language ?? i18n.resolvedLanguage ?? "en";
  const currentLanguage: LanguageCode = rawLanguage.split(
    "-",
  )[0] as LanguageCode;
  const isRtl = isRtlLanguage(currentLanguage);

  return (
    <Navbar
      expand="lg"
      className="app-header border-bottom"
      variant={theme === "dark" ? "dark" : "light"}
    >
      <Container fluid>
        <Navbar.Brand
          as={Link}
          to="/"
          className="d-flex align-items-center gap-2"
        >
          <img
            src="/logo.png"
            alt="Helexa logo"
            width={28}
            height={28}
            style={{ borderRadius: "999px" }}
          />
          <span className="fw-semibold text-uppercase small tracking-wide">
            {t("app.name")}
          </span>
        </Navbar.Brand>

        <Navbar.Toggle aria-controls="main-navbar" />

        <Navbar.Collapse id="main-navbar">
          <Nav className="me-auto">
            <NavLink
              to="/"
              end
              className={({ isActive }): string =>
                isActive ? "nav-link active" : "nav-link"
              }
            >
              {t("nav.dashboard")}
            </NavLink>
          </Nav>

          <div className="d-flex align-items-center gap-2">
            <Button
              size="sm"
              variant="outline-secondary"
              type="button"
              onClick={toggleTheme}
              aria-label={
                theme === "dark"
                  ? t("theme.toggle.toLight")
                  : t("theme.toggle.toDark")
              }
              className="d-inline-flex align-items-center justify-content-center"
            >
              {theme === "dark" ? (
                <FaRegSun size={16} />
              ) : (
                <FaRegMoon size={16} />
              )}
            </Button>
          </div>

          <Dropdown
            align={isRtl ? "start" : "end"}
            className={theme === "dark" ? "dropdown-menu-dark-context" : ""}
          >
            <Dropdown.Toggle
              size="sm"
              variant={theme === "dark" ? "secondary" : "outline-secondary"}
              id="language-switcher"
            >
              <span className="me-1" aria-hidden="true">
                文A
              </span>
              <span>{AUTONYM_MAP[currentLanguage]}</span>
            </Dropdown.Toggle>
            <Dropdown.Menu
              className={theme === "dark" ? "dropdown-menu-dark" : ""}
            >
              {SUPPORTED_LANGUAGES.map((lng) => (
                <Dropdown.Item
                  key={lng}
                  active={lng === currentLanguage}
                  onClick={() => handleLanguageChange(lng)}
                  className="d-flex align-items-center gap-2"
                >
                  <span>{AUTONYM_MAP[lng]}</span>
                  <span className="text-muted small fw-light">
                    · {t(`lang.${lng}`)}
                  </span>
                </Dropdown.Item>
              ))}
            </Dropdown.Menu>
          </Dropdown>
        </Navbar.Collapse>
      </Container>
    </Navbar>
  );
};

export default Header;
