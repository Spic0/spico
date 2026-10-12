"use client";

import Link from "next/link";
import { useState } from "react";
import { useTheme } from "./ThemeProvider";
import { signOutAction } from "@/lib/actions/sign-out";

interface TopBarProps {
  userFullName: string | null;
  userEmail: string | null;
  homeHref: string;
}

export function TopBar({ userFullName, userEmail, homeHref }: TopBarProps) {
  const { themePreference, cycleTheme, sidebarCollapsed, toggleSidebar } = useTheme();
  const [profileOpen, setProfileOpen] = useState(false);

  // Icon + label reflect the CURRENT preference; clicking advances
  // light -> dark -> system -> light.
  const themeMeta = {
    light: { icon: "fa-sun", label: "Theme: Light — switch to Dark" },
    dark: { icon: "fa-moon", label: "Theme: Dark — switch to System" },
    system: { icon: "fa-desktop", label: "Theme: System — switch to Light" },
  }[themePreference];

  return (
    <div className="header-area-one">
      <div className="container-30">
        <div className="header-inner-one">
          <div className="left-logo-area">
            <Link href={homeHref} className="logo spico-wordmark">
              SPICO
            </Link>
            <button
              type="button"
              onClick={toggleSidebar}
              className={`left-side-open-clouse ${sidebarCollapsed ? "collapsed" : ""}`}
              aria-label="Toggle sidebar"
            >
              <i className="fa-solid fa-bars" aria-hidden="true" />
            </button>
          </div>
          <div className="header-right">
            <div className="action-interactive-area__header">
              <button
                type="button"
                onClick={cycleTheme}
                className="single_action__haeader rts-dark-light"
                aria-label={themeMeta.label}
                title={themeMeta.label}
              >
                <i className={`fa-solid ${themeMeta.icon}`} aria-hidden="true" />
              </button>
              <div className="single_action__haeader user_avatar__information">
                <button
                  type="button"
                  className="avatar"
                  onClick={() => setProfileOpen((open) => !open)}
                  aria-expanded={profileOpen}
                  aria-label="Open account menu"
                >
                  <i className="fa-solid fa-circle-user" aria-hidden="true" />
                </button>
                <div
                  className="user_information_main_wrapper"
                  style={{ display: profileOpen ? "block" : "none" }}
                >
                  <div className="user_header">
                    <div className="user_naim-information">
                      <h3 className="title">{userFullName ?? "Unnamed user"}</h3>
                      <span className="desig">{userEmail ?? ""}</span>
                    </div>
                  </div>
                  <div className="user_body_content">
                    <ul className="items">
                      <li className="single_items">
                        <Link className="hader_popup_link" href="/profile">
                          <i className="fa-light fa-user" aria-hidden="true" /> Profile
                        </Link>
                      </li>
                    </ul>
                  </div>
                  <div className="popup-footer-btn">
                    <form action={signOutAction}>
                      <button type="submit" className="geex-content__header__popup__footer__link">
                        Logout <i className="fa-light fa-arrow-right" aria-hidden="true" />
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
